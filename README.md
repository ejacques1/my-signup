# College Awareness

Email-gated scholarship resource page, adapted from the requested Blackwell example. Uses plain HTML/CSS/JavaScript and Node.js functions on Vercel. No runtime dependencies.

## Run

`npm run dev` serves the preview at http://127.0.0.1:3000. `npm test` checks signup and document protection; `npm run build` checks public assets.

`SYSTEME_API_KEY` is server-only. The existing Vercel `my-signup` project has a protected Production value; Vercel cannot export it for local use. Local preview safely refuses signups without a real key. Never use a public environment-variable prefix or commit the key.

## Signup flow

The server finds or creates the exact `Download` tag, looks up the email, creates a contact only if needed, assigns the tag to existing and new contacts, and reads the contact again to confirm the tag. Only then does it issue a signed, HttpOnly, Secure, SameSite cookie valid for 24 hours. Provider failures leave the document locked. Existing subscription status and other tags are preserved.

The guide is not bundled in public HTML or JavaScript. Both document rendering and download require the signed cookie. API responses disable browser and CDN caching. Local storage is never used for authorization. This is an email signup gate, not verification of email ownership.

## Keep the document private

`College Scholarship Resources.md` remains in this folder, unchanged. It is ignored by Git because the repository is public. Vercel includes it only in the document function through `includeFiles`; `.vercelignore` permits uploading it directly from this checkout. Deploy from this folder with the Vercel CLI. A GitHub-only build lacks the file and intentionally fails instead of publishing a broken gate. Keep a private backup of the original resource.

For a preview using the existing protected Production key without assigning the production domain: `npx vercel deploy --prod --skip-domain`. Review before promoting it to the public domain. Normal Preview deployments require the key to be configured separately for that environment.

The warm-instance request throttle is best effort, not a distributed rate limiter. Configure Vercel Firewall limits if traffic or abuse warrants it. The form includes a honeypot, same-origin checks, bounded input, and upstream timeouts.

## API references

- https://developer.systeme.io/reference/api_contacts_get_collection-1
- https://developer.systeme.io/reference/post_contact-1
- https://developer.systeme.io/reference/post_contact_tag-1
- https://developer.systeme.io/reference/api_tags_get_collection-1
