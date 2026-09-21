# Admin traditional login

Admin password login is available at the shared login page when the user opens `/admin` without an authenticated admin session. The flow uses:

- bcrypt-hashed passwords stored in `app_user.password_hash`;
- an existing admin role in `user_role`;
- the existing JWT access token and rotated refresh token mechanism;
- a five-attempt-per-minute throttle on the public login endpoint;
- httpOnly cookies at the frontend BFF boundary.

There is no default admin email or password. Provision an account from the backend environment with:

```bash
npm run admin:create -- --email admin@example.com --password "choose-a-password-of-at-least-12-chars" --role OPERATIONS_ADMIN
```

Supported admin roles are `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `CONTENT_ADMIN`, `SUPPORT_ADMIN`, and `MODERATION_ADMIN`. The command updates an existing account by email or creates it when absent, stores only the bcrypt hash, and never prints the password.

The frontend route is:

```text
https://www.spotva.co/az/login?redirect=%2Fadmin&admin=1
```

Opening `/admin` automatically redirects unauthenticated visitors to that admin login mode. A regular customer account with no admin role is rejected with the same generic invalid-credentials response as an incorrect password.
