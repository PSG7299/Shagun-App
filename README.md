# Shagun Wishlist

A wedding wishlist web app. The couple lists what they are saving for and shares one link.
Guests open it without any account, pick a dream, and pay the couple directly by UPI.

## How it works

| Who | What they do |
|---|---|
| Couple | Sign in with Google, create a wishlist (names, date, UPI ID), add dreams with targets, share the link |
| Guest | Open the link, choose a dream and an amount, pay through any UPI app (button or QR), record the gift with a blessing |

Money goes straight from the guest's bank to the couple's UPI ID. This site never holds it.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The site (no build step) |
| `backend.js` | Data layer: Firebase when configured, otherwise a demo saved in the browser |
| `firebase-config.js` | Your Firebase keys go here |
| `firestore.rules` | Database security rules to paste into Firebase |

## Go live (about 15 minutes, free)

1. **Host it.** GitHub repo → Settings → Pages → Source: `main` branch, `/ (root)`. Your site appears at `https://<username>.github.io/Shagun-App/`. Until step 5 it runs in demo mode.
2. **Create a Firebase project** at https://console.firebase.google.com (no Google Analytics needed).
3. **Firestore:** Build → Firestore Database → Create database (production mode, region `asia-south1`). Open the Rules tab, paste the contents of `firestore.rules`, Publish.
4. **Sign-in:** Build → Authentication → Sign-in method → enable Google. Then Authentication → Settings → Authorized domains → add `<username>.github.io`.
5. **Connect:** Project settings → Your apps → Web app (`</>`) → Register. Copy `apiKey`, `authDomain`, `projectId` and `appId` into `firebase-config.js` and commit.

These Firebase web keys are meant to be public; the security rules are what protect the data.

## Limits to know

- **Payments are not verified.** A guest taps "I've paid" after paying in their UPI app. The couple can remove wrong entries from the couple's desk. Automatic confirmation needs a payment gateway (Razorpay, Cashfree), which requires business KYC and charges a fee per payment.
- **Gift amounts are hidden in the page, not secret.** Guests see names and blessings only, but the amounts are stored in the same public records.
- **The Firebase path has not been tested against a live project yet.** Demo mode has been tested end to end.
