// CDK entry point: reads the deploy parameters and instantiates the stack.
//
// Two deploy parameters, both required, both read from the environment:
//
//   DOMAIN      Custom domain name for the API, e.g. "api.example.com". A public
//               Route53 hosted zone for its parent ("example.com") must already exist
//               in the target account: the stack creates the DNS-validated ACM
//               certificate in it, plus the A alias record pointing at the API.
//               The stack name is derived from it ("ApiExampleCom"), so several
//               domains can be deployed side by side in one account.
//
//   TRUSTSTORE  S3 URI of the mTLS truststore, the PEM bundle of CA certificates whose
//               clients the API accepts, as "s3://bucket/key" with an optional
//               "?versionId=..." to pin one object version. The bucket is not managed
//               here and must already be readable by API Gateway.
//
// The hosted-zone lookup runs at synth time, so CDK_DEFAULT_ACCOUNT and
// CDK_DEFAULT_REGION must be set too; the cdk CLI exports them from your AWS profile.
//
//     DOMAIN=api.example.com TRUSTSTORE=s3://my-bucket/truststore.pem npx cdk deploy
//
// Clients must then present a certificate signed by a CA in the truststore. The
// generated execute-api endpoint is disabled, so the custom domain is the only way in.
//
// What gets deployed lives in stack.ts.

import * as cdk from "aws-cdk-lib";
import { HonoAppStack } from "./stack.ts";

/** Reads a required deploy parameter from the environment. */
function parameter(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; export it before running cdk.`);
  return value;
}

/**
 * Derives the stack name from DOMAIN, keeping one stack per domain in an account.
 *
 * Dots and hyphens are dropped and each label capitalised, so api.example.com becomes
 * ApiExampleCom. Capitalising also normalises case, which DNS ignores but
 * CloudFormation does not.
 *
 * A leading digit is rejected: hostnames allow one, stack names do not, and there is
 * no name to fall back on now that the mapping is prefix-free.
 *
 * Note the two separators become the same boundary, so my-api.example.com and
 * my.api.example.com derive the same name. Nothing here can catch that, since it
 * only shows up across two deploys; keep such a pair out of one account.
 */
function stackId(domain: string): string {
  const label = "[a-z0-9]+(-[a-z0-9]+)*";
  if (!new RegExp(`^${label}(\\.${label})+$`, "i").test(domain)) {
    throw new Error(
      `DOMAIN must be a dotted hostname like api.example.com, got ${JSON.stringify(domain)}`,
    );
  }
  if (!/^[a-z]/i.test(domain)) {
    throw new Error(
      `DOMAIN must start with a letter, as stack names do, got ${JSON.stringify(domain)}`,
    );
  }
  return domain
    .split(/[.-]/)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

const app = new cdk.App();
const domain = parameter("DOMAIN");
new HonoAppStack(app, stackId(domain), {
  description: `Hono Lambda behind an mTLS API Gateway for ${domain}`,
  domain,
  truststore: parameter("TRUSTSTORE"),
  // HostedZone.fromLookup needs a concrete account and region to query at synth time.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
app.synth();
