// (public)/layout.tsx already wraps this segment's not-found boundary with
// ConsumerNav/CustomerFooter, so reuse the same body as the root not-found.tsx
// without re-adding nav/footer chrome.
export { NotFoundContent as default } from "@/components/not-found-content";
