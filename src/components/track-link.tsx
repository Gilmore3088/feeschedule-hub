"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";

type TrackLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    event: AnalyticsEvent;
    eventProps?: Record<string, string | number | boolean>;
    children: ReactNode;
  };

/** A next/link that records an analytics event on click. */
export function TrackLink({ event, eventProps, onClick, children, ...rest }: TrackLinkProps) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        trackEvent(event, eventProps);
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
