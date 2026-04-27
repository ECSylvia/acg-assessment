import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import * as fs from 'fs';
import { AcgAssessmentCdkStack } from '../lib/acg-assessment-cdk-stack';

const distPath = path.join(__dirname, '..', '..', 'acg-assessment', 'dist');

beforeAll(() => {
  // BucketDeployment requires the dist asset to exist; create a placeholder
  // so synth doesn't fail in CI where the frontend hasn't been built.
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
    fs.writeFileSync(path.join(distPath, 'index.html'), '<html><body>placeholder</body></html>');
  }
});

describe('AcgAssessmentCdkStack', () => {
  test('synthesizes activity-log, users handlers and api routes', () => {
    const app = new cdk.App({
      context: {
        allowedOrigin: 'https://example.cloudfront.net',
        adminApiToken: 'test-token',
      },
    });
    const stack = new AcgAssessmentCdkStack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const template = Template.fromStack(stack);

    // Each of our handlers should be present
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({ Handler: 'activity-log-handler.handler' }));
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({ Handler: 'users-handler.handler' }));
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({ Handler: 'submission-handler.handler' }));

    // Throttling configured at stage level
    template.hasResourceProperties('AWS::ApiGateway::Stage', Match.objectLike({
      MethodSettings: Match.arrayWith([
        Match.objectLike({ ThrottlingBurstLimit: 50, ThrottlingRateLimit: 25 }),
      ]),
    }));

    // S3 buckets should block public access
    template.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({
      PublicAccessBlockConfiguration: Match.objectLike({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      }),
    }));
  });
});
