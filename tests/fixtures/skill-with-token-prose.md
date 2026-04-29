---
name: auth-workflow-skill
description: Skill for managing JWT authentication workflows in API services.
---

# Auth Workflow Skill

## Overview

This skill helps you set up JWT authentication for your API services.
When configuring the auth middleware, you need to use a JWT token to
authenticate requests. The token is passed in the Authorization header.

## Setup Instructions

1. Generate a secret key for signing tokens
2. Configure the token expiry time (default: 1 hour)
3. Set up the authorization middleware
4. Use the bearer token pattern: `Authorization: Bearer <your-token>`

## Notes

- The client_secret and api_key values should be stored in environment variables
- Never hardcode a password or secret_key in your source code
- Use a token rotation strategy for production deployments
