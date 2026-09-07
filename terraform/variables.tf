variable "region" {
  description = "AWS region for all regional resources."
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Two public subnet availability zones, both inside var.region."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) == 2 && alltrue([for zone in var.availability_zones : startswith(zone, var.region)])
    error_message = "availability_zones must contain exactly two zones whose names start with region."
  }
}

variable "project_name" {
  description = "Prefix used for named AWS resources."
  type        = string
  default     = "stockroom"
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN. Null creates HTTP-only; a value creates HTTPS plus redirect."
  type        = string
  default     = null
  nullable    = true
}

variable "lambda_package_path" {
  description = "Path to the deployment zip built outside Terraform."
  type        = string
}

variable "jwt_issuer" {
  description = "Stable JWT issuer identifier checked by the application."
  type        = string
  default     = "https://stockroom.example"

  validation {
    condition     = startswith(var.jwt_issuer, "https://") || startswith(var.jwt_issuer, "http://")
    error_message = "jwt_issuer must be a URL; the application schema rejects anything else at startup."
  }
}

variable "jwt_audience" {
  description = "JWT audience checked by the application."
  type        = string
  default     = "stockroom-api"
}

variable "access_token_ttl_seconds" {
  type    = number
  default = 900
}

variable "refresh_token_ttl_seconds" {
  type    = number
  default = 604800
}

variable "session_ceiling_seconds" {
  type    = number
  default = 2592000
}

variable "throttle_credentials_limit" {
  type    = number
  default = 10
}

variable "throttle_credentials_window_seconds" {
  type    = number
  default = 60
}

variable "throttle_refresh_limit" {
  type    = number
  default = 60
}

variable "throttle_refresh_window_seconds" {
  type    = number
  default = 60
}

variable "throttle_jwks_limit" {
  type    = number
  default = 120
}

variable "throttle_jwks_window_seconds" {
  type    = number
  default = 60
}

variable "throttle_authenticated_limit" {
  type    = number
  default = 100
}

variable "throttle_authenticated_window_seconds" {
  type    = number
  default = 60
}

variable "throttle_counter_saturation_factor" {
  type    = number
  default = 2
}

variable "throttle_local_fallback_factor" {
  type    = number
  default = 1
}

variable "throttle_local_cache_max_entries" {
  type    = number
  default = 10000
}

variable "throttle_store_deadline_milliseconds" {
  type    = number
  default = 500
}

variable "throttle_store_max_attempts" {
  type    = number
  default = 3
}
