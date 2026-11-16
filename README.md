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

## How the data is stored

| Record | Who can read it | What it holds |
|---|---|---|
| `wishlists/{id}` | Anyone with the link | Names, date, UPI ID, optional QR image, dreams |
| `wishlists/{id}/gifts/{gid}` | Anyone with the link | Guest name, blessing, which dream. No amount |
| `wishlists/{id}/amounts/{gid}` | The couple only | The amount of that gift |
| `wishlists/{id}/totals/{goal}` | Anyone with the link | Running total for one dream |

A guest records a gift as one all-or-nothing write to `gifts`, `amounts` and `totals`. The rules check all three against each other, so a total cannot be raised without a matching gift, and gifts cannot be written to a wishlist or dream that does not exist.

The couple can upload a picture of their own UPI QR code (Couple's desk → Wedding details). It is shrunk in the browser and saved inside the wishlist record; guests then see it instead of the automatic QR code.

## Limits to know

- **Payments are not verified.** A guest taps "I've paid" after paying in their UPI app. The couple can remove wrong entries from the couple's desk. Automatic confirmation needs a payment gateway (Razorpay, Cashfree), which requires business KYC and charges a fee per payment.
- **Amounts are private, totals are public.** Guests cannot read what anyone gave. Someone watching a dream's total closely could still work out an amount from how much the total moved when a new name appeared.
- **No spam protection yet.** Anyone with the link can record a gift without paying. Fake entries need a real wishlist and dream, are size-limited, and the couple can remove them.
- **Google sign-in has not been tested on the live site yet.** Everything else was tested against the Firebase emulator.
