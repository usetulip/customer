"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import type { IntakeBriefPayload, Project } from "@/lib/api"
import { cn } from "@/lib/utils"

const LAYOUT_OPTIONS = [
  { value: "saas-dashboard", label: "SaaS Dashboard" },
  { value: "settings-hub", label: "Settings Hub" },
  { value: "data-analytics", label: "Data/Analytics View" },
  { value: "feed-social", label: "Feed/Social" },
] as const

const FEATURE_OPTIONS = [
  "Data Tables",
  "Modal Forms",
  "Line/Bar Charts",
  "Date Pickers",
  "User Avatars",
] as const

type IntakeBriefProps = {
  onSubmit: (payload: IntakeBriefPayload) => Promise<void>
  existingProject?: Project | null
}

function isValidHex(color: string) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim())
}

function toPickerHex(color: string) {
  const trimmed = color.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return `#${trimmed}`
  }
  return "#000000"
}

function ColorTokenField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const pickerId = `${id}-picker`
  const swatchColor = isValidHex(value) ? value : "#e5e7eb"

  return (
    <Field>
      <FieldLabel htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </FieldLabel>
      <div className="flex items-center gap-3">
        <label
          htmlFor={pickerId}
          className={cn(
            "relative size-10 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] shadow-sm transition-shadow",
            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:ring-2 hover:ring-[var(--portal-accent)]/30"
          )}
          style={{ backgroundColor: swatchColor }}
          title="Pick a color"
        >
          <input
            id={pickerId}
            type="color"
            value={toPickerHex(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        <Input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#E65F00"
          className="h-10 flex-1 rounded-lg border-[#e5e7eb] bg-white font-mono text-sm font-normal uppercase shadow-none"
        />
      </div>
    </Field>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">
      {children}
    </h3>
  )
}

export function IntakeBrief({ onSubmit, existingProject }: IntakeBriefProps) {
  const hasSubmitted =
    existingProject &&
    (existingProject.status === "pending_approval" ||
      existingProject.status === "processing" ||
      existingProject.status === "delivered")

  const [primaryColor, setPrimaryColor] = useState(
    existingProject?.primaryColor ?? "#E65F00"
  )
  const [secondaryColor, setSecondaryColor] = useState(
    existingProject?.secondaryColor ?? "#f5f5f5"
  )
  const [backgroundColor, setBackgroundColor] = useState(
    existingProject?.backgroundColor ?? "#ffffff"
  )
  const [layoutType, setLayoutType] = useState(
    existingProject?.layoutType ?? "saas-dashboard"
  )
  const [features, setFeatures] = useState<string[]>(
    existingProject?.features ?? []
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleFeature(feature: string) {
    if (hasSubmitted) {
      return
    }
    setFeatures((current) =>
      current.includes(feature)
        ? current.filter((item) => item !== feature)
        : [...current, feature]
    )
  }

  return (
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-0">
      <CardHeader className="gap-1 border-b border-[#f0f0f0] px-6 pb-5 pt-6">
        <CardTitle className="text-lg font-semibold tracking-[-0.01em]">
          Configure Your UI DNA
        </CardTitle>
        <CardDescription className="text-sm font-normal text-[#6b7280]">
          Complete this 5-minute setup to get started
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-5">
        {hasSubmitted ? (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-4 py-5 text-center text-sm text-[#6b7280]">
            Your intake brief has been submitted and is being processed.
          </div>
        ) : null}
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (hasSubmitted) {
              return
            }
            setIsSubmitting(true)
            setError(null)
            try {
              await onSubmit({
                primaryColor,
                secondaryColor,
                backgroundColor,
                layoutType,
                features,
              })
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to submit brief"
              )
            } finally {
              setIsSubmitting(false)
            }
          }}
        >
          <FieldGroup className="gap-6">
            <FieldSet className="gap-4">
              <SectionTitle>Brand Tokens</SectionTitle>
              <div className="grid gap-4">
                <ColorTokenField
                  id="primary-color"
                  label="Primary Brand Color"
                  value={primaryColor}
                  onChange={setPrimaryColor}
                  disabled={!!hasSubmitted}
                />
                <ColorTokenField
                  id="secondary-color"
                  label="Secondary Color"
                  value={secondaryColor}
                  onChange={setSecondaryColor}
                  disabled={!!hasSubmitted}
                />
                <ColorTokenField
                  id="background-color"
                  label="Background Preference"
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                  disabled={!!hasSubmitted}
                />
              </div>
            </FieldSet>

            <Separator className="bg-[#f0f0f0]" />

            <FieldSet className="gap-3">
              <SectionTitle>Core Layout Type</SectionTitle>
              <RadioGroup
                value={layoutType}
                onValueChange={setLayoutType}
                disabled={!!hasSubmitted}
                className="gap-2.5"
              >
                {LAYOUT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`layout-${option.value}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3.5 transition-colors",
                      layoutType === option.value &&
                        "border-[var(--portal-accent)]/30 bg-[var(--portal-accent-light)]",
                      hasSubmitted && "cursor-not-allowed opacity-70"
                    )}
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`layout-${option.value}`}
                      className="size-[18px] border-[#d1d5db] data-checked:border-[var(--portal-accent)] data-checked:bg-[var(--portal-accent)] data-checked:text-white"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </FieldSet>

            <Separator className="bg-[#f0f0f0]" />

            <FieldSet className="gap-3">
              <SectionTitle>Feature Scope</SectionTitle>
              <div className="flex flex-col gap-2.5">
                {FEATURE_OPTIONS.map((feature) => {
                  const id = `feature-${feature.toLowerCase().replace(/\s+/g, "-")}`
                  const checked = features.includes(feature)

                  return (
                    <label
                      key={feature}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3.5 transition-colors",
                        checked &&
                          "border-[var(--portal-accent)]/30 bg-[var(--portal-accent-light)]",
                        hasSubmitted && "cursor-not-allowed opacity-70"
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        disabled={!!hasSubmitted}
                        onCheckedChange={() => toggleFeature(feature)}
                        className="size-[18px] rounded-[5px] border-[#d1d5db] data-checked:border-[var(--portal-accent)] data-checked:bg-[var(--portal-accent)] data-checked:text-white"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {feature}
                      </span>
                    </label>
                  )
                })}
              </div>
            </FieldSet>

            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : null}

            {!hasSubmitted ? (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full rounded-xl bg-[var(--portal-accent)] text-base font-semibold text-white shadow-[0_2px_8px_rgba(230,95,0,0.25)] hover:bg-[#d45500]"
              >
                {isSubmitting ? "Submitting..." : "Initialize Sprint"}
              </Button>
            ) : null}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
