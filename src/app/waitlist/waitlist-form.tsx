"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { joinWaitlist, type WaitlistResult } from "./actions";

const ASSET_SIZES = [
  { value: "under_50m", label: "Under $50M" },
  { value: "50m_100m", label: "$50M - $100M" },
  { value: "100m_250m", label: "$100M - $250M" },
  { value: "250m_500m", label: "$250M - $500M" },
  { value: "500m_1b", label: "$500M - $1B" },
  { value: "over_1b", label: "Over $1B" },
] as const;

const CHARTER_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "credit_union", label: "Credit Union" },
  { value: "thrift", label: "Thrift / Savings Institution" },
] as const;

export function WaitlistForm() {
  const [state, formAction, isPending] = useActionState<
    WaitlistResult | null,
    FormData
  >(joinWaitlist, null);

  if (state?.success) {
    return (
      <div className="rounded-lg border bg-green-50 p-8 text-center">
        <h3 className="text-xl font-semibold text-green-900">
          You&apos;re on the list!
        </h3>
        <p className="mt-2 text-green-700">
          We&apos;ll be in touch soon with early access details.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.success && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Your Name</Label>
        <Input id="name" name="name" placeholder="Jane Smith" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="jane@firstcommunitybank.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="institution">Institution Name</Label>
        <Input
          id="institution"
          name="institution"
          placeholder="First Community Bank"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assetSize">Asset Size</Label>
        <Select name="assetSize" required>
          <SelectTrigger id="assetSize">
            <SelectValue placeholder="Select asset range" />
          </SelectTrigger>
          <SelectContent>
            {ASSET_SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="charterType">Charter Type</Label>
        <Select name="charterType" required>
          <SelectTrigger id="charterType">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {CHARTER_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Joining..." : "Join the Waitlist"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        We&apos;ll never share your information. Founding members get the first
        year free.
      </p>
    </form>
  );
}
