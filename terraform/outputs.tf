output "load_balancer_dns_name" {
  description = "DNS name of the application load balancer."
  value       = aws_lb.api.dns_name
}

output "table_name" {
  description = "DynamoDB table name used by the application."
  value       = aws_dynamodb_table.stockroom.name
}

output "function_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.api.function_name
}

output "signing_key_parameter_name" {
  description = "SSM parameter holding the RS256 signing key."
  value       = aws_ssm_parameter.signing_key.name
}

output "verification_keys_parameter_name" {
  description = "SSM parameter holding the verification key set."
  value       = aws_ssm_parameter.verification_keys.name
}
