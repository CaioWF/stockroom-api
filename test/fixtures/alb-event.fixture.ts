import type { ALBEvent } from 'aws-lambda';

// A real single-value (not multi-value) Application Load Balancer target
// request event, field-for-field per AWS's own documented shape:
// https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html#receive-event-from-load-balancer
// The plan names this mode specifically because the alternative, multi-value
// headers, changes field names (`multiValueHeaders`/`multiValueQueryStringParameters`)
// and is a deployment concern `004-cloud-infrastructure` must set explicitly.
export const albEventFixture: ALBEvent = {
  requestContext: {
    elb: {
      targetGroupArn:
        'arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/stockroom-auth/6d0ecf831eec9f09',
    },
  },
  httpMethod: 'GET',
  path: '/health',
  queryStringParameters: {},
  headers: {
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.8',
    host: 'stockroom-846800462.us-east-2.elb.amazonaws.com',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'x-amzn-trace-id': 'Root=1-5bdb40ca-556d8b0c50dc66f0511bf520',
    'x-forwarded-for': '72.21.198.66',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  },
  isBase64Encoded: false,
  body: '',
};
