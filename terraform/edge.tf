resource "aws_lb" "api" {
  name               = "${var.project_name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.load_balancer.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-lambda-tg"
  target_type = "lambda"

  # Set rather than inherited. Enabling it would change the INBOUND event shape
  # (multiValueHeaders instead of headers) without fixing the outbound problem:
  # the ALB event source in @codegenie/serverless-express truncates
  # array-valued response headers to their first element either way. The day
  # this service emits a repeated response header, both sides need revisiting
  # together.
  lambda_multi_value_headers_enabled = false

  health_check {
    enabled  = true
    path     = "/health"
    matcher  = "200"
    interval = 35
    timeout  = 30
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.certificate_arn == null ? [1] : []

    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }

  dynamic "default_action" {
    for_each = var.certificate_arn == null ? [] : [1]

    content {
      type = "redirect"

      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.certificate_arn == null ? 0 : 1

  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn

  # Set explicitly for the same reason every other default in this stack is:
  # ELB's default policy is ELBSecurityPolicy-2016-08, which still negotiates
  # TLS 1.0 and 1.1. This is the one path meant to be secure; it should not
  # inherit a nine-year-old policy.
  ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lambda_permission" "allow_alb" {
  statement_id  = "AllowExecutionFromALB"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.api.arn
}

resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_lambda_function.api.arn

  depends_on = [aws_lambda_permission.allow_alb]
}
