import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as path from 'path';

export class AcgAssessmentCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create OIDC Provider for GitHub Actions
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // Create IAM Role for GitHub Actions
    const githubRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      assumedBy: new iam.OpenIdConnectPrincipal(githubProvider).withConditions({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com'
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            'repo:ECSylvia/acg-assessment:*',
            'repo:ecsylvia/acg-assessment:*'
          ]
        }
      }),
      description: 'Role for GitHub Actions to deploy the CDK stack',
    });

    // Grant full administrator access so CDK can deploy everything (Use with caution in production)
    githubRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    // Output the Role ARN so we can use it in our GitHub workflow
    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', {
      value: githubRole.roleArn,
      description: 'The ARN of the IAM role for GitHub Actions',
    });

    // 1. Data Drop Buckets
    const dataBucket = new s3.Bucket(this, 'AssessmentData', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const uploadsBucket = new s3.Bucket(this, 'AssessmentUploads', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
      }],
    });

    // 2. Submission Processing Pipeline
    const submissionHandler = new lambda.Function(this, 'SubmissionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'submission-handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        DATA_BUCKET: dataBucket.bucketName,
        UPLOADS_BUCKET: uploadsBucket.bucketName,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '',
      },
      timeout: cdk.Duration.seconds(60),
    });

    dataBucket.grantWrite(submissionHandler);
    uploadsBucket.grantReadWrite(submissionHandler);
    
    // Explicitly allow AWS Textract for Screenshot OCR evaluations
    submissionHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['textract:DetectDocumentText', 'textract:AnalyzeDocument'],
      resources: ['*'],
    }));

    // Grant SES SendEmail permission
    submissionHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    // 2.2 Invite Generator Pipeline
    const inviteHandler = new lambda.Function(this, 'InviteHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'invite-handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        DATA_BUCKET: dataBucket.bucketName,
      },
    });
    dataBucket.grantWrite(inviteHandler);

    // 2.3 Results Fetcher Pipeline
    const resultsHandler = new lambda.Function(this, 'ResultsHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'results-handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      environment: {
        DATA_BUCKET: dataBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
    });
    dataBucket.grantRead(resultsHandler);

    // 3. Http Gateway Interface
    const api = new apigateway.RestApi(this, 'AssessmentApi', {
      restApiName: 'Assessment Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const submissionsResource = api.root.addResource('submissions');
    submissionsResource.addMethod('POST', new apigateway.LambdaIntegration(submissionHandler));

    const invitesResource = api.root.addResource('invites');
    invitesResource.addMethod('POST', new apigateway.LambdaIntegration(inviteHandler));

    const resultsResource = api.root.addResource('results');
    resultsResource.addMethod('GET', new apigateway.LambdaIntegration(resultsHandler));

    // 4. Frontend Web Hosting
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        }
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../acg-assessment/dist'))],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // 5. Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'The URL of the frontend application',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'The URL of the API Gateway',
    });
  }
}
