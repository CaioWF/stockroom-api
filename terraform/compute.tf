resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-api"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "lambda_execution" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:ConditionCheckItem",
        ]
        Resource = aws_dynamodb_table.stockroom.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
        ]
        Resource = [
          aws_ssm_parameter.signing_key.arn,
          aws_ssm_parameter.verification_keys.arn,
        ]
      },
      # Split because the two halves are evaluated against different ARNs:
      # CreateLogGroup against the group itself, the stream actions against
      # the `:*` stream scope under it. Granting CreateLogGroup on the `:*`
      # form makes it inert.
      {
        Effect   = "Allow"
        Action   = "logs:CreateLogGroup"
        Resource = aws_cloudwatch_log_group.lambda.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${var.region}.amazonaws.com"
          }
        }
      },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api"
  role          = aws_iam_role.lambda_execution.arn
  # `src/lambda.handler`, not `lambda.handler`: tsconfig.build.json excludes
  # only `test`, so `scripts/` compiles too and tsc's inferred rootDir becomes
  # the repository root — the build emits dist/src/lambda.js. The runbook zips
  # from inside dist/, so `src/lambda.js` is the archive root path. Getting
  # this wrong fails before src/lambda.ts's own 503 guard can run, as an
  # opaque Runtime.ImportModuleError.
  handler  = "src/lambda.handler"
  runtime  = "nodejs22.x"
  filename = var.lambda_package_path

  # 1024 MB is ~0.58 vCPU, which takes argon2id at 19 MiB of memory cost
  # (argon2-password-hasher.ts) out of the multi-second range; 128 MB does not.
  # 30s covers a cold start that builds the whole Nest application inside the
  # first invocation (src/lambda.ts) and stays under the ALB's 60s idle
  # timeout. The architecture is pinned because @node-rs/argon2 ships a
  # platform-specific native binary.
  memory_size   = 1024
  timeout       = 30
  architectures = ["x86_64"]

  environment {
    variables = {
      TABLE_NAME                            = aws_dynamodb_table.stockroom.name
      JWT_ISSUER                            = var.jwt_issuer
      JWT_AUDIENCE                          = var.jwt_audience
      ACCESS_TOKEN_TTL_SECONDS              = tostring(var.access_token_ttl_seconds)
      REFRESH_TOKEN_TTL_SECONDS             = tostring(var.refresh_token_ttl_seconds)
      SESSION_CEILING_SECONDS               = tostring(var.session_ceiling_seconds)
      SIGNING_KEY_PARAMETER_NAME            = aws_ssm_parameter.signing_key.name
      VERIFICATION_KEYS_PARAMETER_NAME      = aws_ssm_parameter.verification_keys.name
      THROTTLE_CREDENTIALS_LIMIT            = tostring(var.throttle_credentials_limit)
      THROTTLE_CREDENTIALS_WINDOW_SECONDS   = tostring(var.throttle_credentials_window_seconds)
      THROTTLE_REFRESH_LIMIT                = tostring(var.throttle_refresh_limit)
      THROTTLE_REFRESH_WINDOW_SECONDS       = tostring(var.throttle_refresh_window_seconds)
      THROTTLE_JWKS_LIMIT                   = tostring(var.throttle_jwks_limit)
      THROTTLE_JWKS_WINDOW_SECONDS          = tostring(var.throttle_jwks_window_seconds)
      THROTTLE_AUTHENTICATED_LIMIT          = tostring(var.throttle_authenticated_limit)
      THROTTLE_AUTHENTICATED_WINDOW_SECONDS = tostring(var.throttle_authenticated_window_seconds)
      THROTTLE_COUNTER_SATURATION_FACTOR    = tostring(var.throttle_counter_saturation_factor)
      THROTTLE_LOCAL_FALLBACK_FACTOR        = tostring(var.throttle_local_fallback_factor)
      THROTTLE_LOCAL_CACHE_MAX_ENTRIES      = tostring(var.throttle_local_cache_max_entries)
      THROTTLE_STORE_DEADLINE_MILLISECONDS  = tostring(var.throttle_store_deadline_milliseconds)
      THROTTLE_STORE_MAX_ATTEMPTS           = tostring(var.throttle_store_max_attempts)
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}
