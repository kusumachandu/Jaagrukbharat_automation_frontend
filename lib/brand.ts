// Who the end-user session page says it's from. Someone opening a link that
// asks for an OTP or CAPTCHA needs to see plainly whose service this is —
// an unbranded page collecting codes reads like phishing, to people and to
// browsers' safe-browsing checks alike.
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "Jaagruk Bharat";

// Link to the organisation's privacy policy. Unset = no link shown (never a
// guessed URL that might 404).
export const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL || "";
