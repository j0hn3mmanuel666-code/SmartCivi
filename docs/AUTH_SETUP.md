# Google sign-in and email verification

Implemented locally; real Google sign-in and inbox delivery require your provider credentials. Existing accounts retain their passwords, roles and access. New email registrations must verify before signing in. New Google registrations are citizens. This does not implement password reset.

## Native development (`npm run xian`)

From the project directory, copy `.env.auth.example` to `.env.auth` and fill in the credentials below. Restart `npm run xian` after configuration changes. Environment variables override this file. The application reads only the authentication keys from it; it does not import Docker database credentials from `.env`.

```powershell
Copy-Item .env.auth.example .env.auth
notepad .env.auth
npm run xian
```

`.env.auth` is ignored by Git and Docker. Keep secrets in that local file rather than in source control or chat. `PUBLIC_ORIGIN` must match the browser address, for example `http://localhost:3000`. Use that same hostname consistently through the Google flow; localhost and 127.0.0.1 have different session cookies. Production requires an HTTPS origin without a path.

## Google configuration

1. Create or choose a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Configure Google Auth Platform branding and audience. While the app is in testing, add the Google accounts you will use as test users.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI for local testing:

   `http://localhost:3000/auth/google/callback`

4. Copy its client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `PUBLIC_ORIGIN=http://localhost:3000`.
5. Restart the app. The **Continue with Google** button will become available on both `/login` and `/register`.

The callback must match the configured origin and port. Add your production HTTPS callback separately when deploying. The server authorization-code flow uses state, nonce, PKCE and the official Google authentication library to verify identity tokens. It requests only basic identity scopes, and does not store Google access or refresh tokens. See [Google's OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

### Existing SmartCivi accounts

An existing account is never connected just because its email matches a Google response. First sign in using the existing password, open **My profile**, and choose **Connect Google account**. Select the Google account with the same email. Future Google sign-ins retain the existing SmartCivi role. If that account has no known password, contact the office; this feature does not bypass the password or reset it.

## Verification email configuration

Use the SMTP settings supplied by your mail provider. Configure:

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
MAIL_FROM="SmartCivi <verified-sender@your-domain.example>"
```

Use a sender the provider authorizes. For TLS on port 465, set `SMTP_PORT=465` and `SMTP_SECURE=true`. Port 587 uses mandatory STARTTLS. Certificate verification stays enabled. SMTP submission acceptance does not prove inbox delivery; check the receiving inbox and spam folder. See [Nodemailer SMTP configuration](https://nodemailer.com/smtp).

New email registration is unavailable until sender configuration is present. If sending fails after an account was created, it remains pending and can request another email once mail delivery is restored. The UI never displays or logs the verification link. Links expire in 30 minutes; opening one shows a confirmation screen and clicking **Confirm email address** consumes it once. Resending replaces the old link, with a persistent one-minute cooldown. Login and account endpoints also have a per-process IP request limit; multi-instance deployments need a shared proxy or store for that limit.

## Docker

Put the same authentication keys into the existing `.env` alongside Docker settings. Compose passes them into the app. Rebuild/recreate using the normal project command:

For the current port **3001** instance (`smartcivi-main`), the private credentials are in `SmartCivi-main/.env` and its Compose override explicitly passes `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `PUBLIC_ORIGIN` is `http://localhost:3001`. The Google client must authorize `http://localhost:3001/auth/google/callback`; retaining the existing port 3000 callback supports native development too. An enabled button confirms local configuration, while Google's `redirect_uri_mismatch` means the requested callback is not authorized on that client. Do not change the public origin to another running app's port to work around this error.

The native `.env.auth` file is intentionally excluded from the Docker image, so native credentials do not become available in a container automatically. After changing Compose environment settings, recreate the app using the port 3001 command in `docs/MAINTENANCE.md`. Keep `.env` files ignored by Git and never put credentials in Compose YAML.

```powershell
docker compose up --build -d --wait
```

Do not run `npm run migrate`: it destructively resets data. Normal startup adds only the authentication columns and preserves existing users. Existing users are grandfathered into password access; no unproven verification date is assigned to them.

## Verify after setup

1. Register a new email account; confirm that it cannot access the dashboard before verification.
2. Check the actual inbox, open the link, confirm it, and sign in. Reusing the link must fail.
3. Request a replacement and confirm that the previous link no longer works. An expired link should offer resending.
4. Use Google on a new email and confirm it creates a citizen account.
5. Connect an existing account from My profile, sign out, and sign back in with Google. Check its role remains unchanged.
6. Cancel the Google screen and check that SmartCivi returns a friendly message.

Automated tests use a disposable MySQL database ending in `_test`, a captured mail transport, and simulated Google responses. They cover registration, verification, resending, token expiration/reuse, CSRF, callback state, verified Google claims, account linking and existing role preservation. They do not replace the live provider checks above.
