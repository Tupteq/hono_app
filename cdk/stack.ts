// The stack itself: a Lambda running the Hono app behind an mTLS HTTP API.
//
// Everything here takes its two parameters as plain props; reading and validating
// them is app.ts's job, so this module stays importable from tests and from any
// other app that wants the same stack.

import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

const ENTRY = path.join(import.meta.dirname, "../src/main.ts");

export interface HonoAppStackProps extends cdk.StackProps {
  domain: string;
  truststore: string;
}

/**
 * Turns an `s3://bucket/key[?versionId=...]` truststore URI into an MTLSConfig.
 *
 * The truststore is the PEM bundle of CAs whose client certificates the API accepts;
 * API Gateway reads it from S3 at deploy time, so the bucket lives outside this stack.
 *
 * The `versionId` query is our own extension: the s3:// scheme has no version syntax
 * (the AWS CLI takes `--version-id` separately), but it keeps this to two parameters.
 * Omit it and API Gateway tracks whatever the key currently holds.
 */
function mtlsConfig(scope: Construct, uri: string): apigw.MTLSConfig {
  const url = URL.parse(uri);
  const key = url?.pathname.replace(/^\/+/, "");
  const extra = [...(url?.searchParams.keys() ?? [])].some((k) => k !== "versionId");
  if (url?.protocol !== "s3:" || !url.hostname || !key || extra) {
    throw new Error(
      `TRUSTSTORE must look like s3://bucket/key[?versionId=...], got ${JSON.stringify(uri)}`,
    );
  }
  return {
    bucket: s3.Bucket.fromBucketName(scope, "Truststore", url.hostname),
    key,
    // Pinning a version makes re-uploading the bundle an explicit, reviewable change.
    version: url.searchParams.get("versionId") ?? undefined,
  };
}

/** Lambda running the Hono app, fronted by an mTLS API Gateway v2 custom domain. */
export class HonoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, { domain, truststore, ...props }: HonoAppStackProps) {
    super(scope, id, props);

    // Bundled locally with esbuild (a devDependency), so synth stays Docker-free.
    const fn = new nodejs.NodejsFunction(this, "Function", {
      entry: ENTRY,
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(10),
      logGroup: new logs.LogGroup(this, "LogGroup", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // Assumes DOMAIN's parent is itself the hosted zone (api.example.com -> example.com).
    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: domain.split(".").slice(1).join("."),
    });

    const domainName = new apigw.DomainName(this, "DomainName", {
      domainName: domain,
      certificate: new acm.Certificate(this, "Certificate", {
        domainName: domain,
        validation: acm.CertificateValidation.fromDns(zone),
      }),
      mtls: mtlsConfig(this, truststore),
    });

    // $default route: API Gateway proxies every path and method to Hono.
    new apigw.HttpApi(this, "HttpApi", {
      defaultIntegration: new integrations.HttpLambdaIntegration("Integration", fn),
      defaultDomainMapping: { domainName },
      // Without this the generated execute-api URL still serves the API without mTLS.
      disableExecuteApiEndpoint: true,
    });

    new route53.ARecord(this, "AliasRecord", {
      zone,
      recordName: domain,
      target: route53.RecordTarget.fromAlias(
        new targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId,
        ),
      ),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: `https://${domain}/` });
  }
}
