import { test } from "node:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { HonoAppStack } from "./stack.ts";

test("stack synthesizes", () => {
  const stack = new HonoAppStack(new cdk.App(), "Test", {
    domain: "api.example.com",
    truststore: "s3://bucket/truststore.pem?versionId=abc",
    env: { account: "123456789012", region: "eu-central-1" },
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs24.x",
    Handler: "index.handler",
  });
  template.hasResourceProperties("AWS::ApiGatewayV2::DomainName", {
    DomainName: "api.example.com",
    MutualTlsAuthentication: {
      TruststoreUri: "s3://bucket/truststore.pem",
      TruststoreVersion: "abc",
    },
  });
  template.hasResourceProperties("AWS::ApiGatewayV2::Api", { DisableExecuteApiEndpoint: true });
});
