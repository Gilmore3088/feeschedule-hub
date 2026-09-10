// (public-strict)/layout.tsx already wraps this segment's not-found boundary
// with ConsumerNav/CustomerFooter, so reuse the shared body directly. A
// same-segment not-found.tsx (rather than falling through to the root one)
// keeps Next.js rendering the not-found boundary inline instead of via its
// cross-group "__next_error__" shell, which defers real content to a
// client-side fetch and leaves curl/non-JS clients seeing an empty body.
export { NotFoundContent as default } from "@/components/not-found-content";
