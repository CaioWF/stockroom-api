# Pre-Merge Checklist

## Tests

- [ ] Unit tests implemented
- [ ] Integration tests implemented
- [ ] Test coverage > 80%
- [ ] All tests pass locally

## Quality Gates

- [ ] Linter has no errors
- [ ] TypeScript types correct
- [ ] No console.log or debug statements
- [ ] Performance within limits

## Documentation

- [ ] Spec updated with final implementation
- [ ] Code commented where necessary
- [ ] README/docs updated
- [ ] Usage examples if applicable

## Code Review

- [ ] PR reviewed by at least 1 reviewer
- [ ] Feedback incorporated or addressed
- [ ] Commits with clear history

## Deploy

- [ ] Migrations tested (if applicable)
- [ ] Environment variables documented
- [ ] Rollback plan documented
- [ ] Monitoring and alerts configured

## Security

- [ ] No hardcoded secrets/credentials
- [ ] Authorization checks use allow-list (not deny-list)
- [ ] Input validated / no injection (SQL/command/path)
- [ ] No SSRF in external requests
- [ ] Strong crypto / unpredictable IDs
- [ ] No new third-party dependency without review (supply-chain)
- [ ] Secrets kept out of logs
