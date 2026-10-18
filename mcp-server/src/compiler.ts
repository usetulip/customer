import { z } from "zod";
import type { ThemeTokens } from "../../lib/token-schema.ts";
import {
  FOCUS_RING,
  FONT_BODY,
  FONT_HEADING,
  GOVERNANCE_RULES,
  ICON_SIZE,
  auditTaste,
  themeVariables,
  type TokenComponent,
} from "./governance.ts";
import { ClientIdSchema } from "./tokens.ts";

// --- Input ---

export const COMPONENT_TYPES = [
  "data-table",
  "stats-grid",
  "form-wizard",
  "navigation-sidebar",
  "modal-dialog",
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

const PlainTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\r\n]*$/, "Must be a single line");

export const CustomRequirementsSchema = z.strictObject({
  component_name: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9]{2,63}$/, "component_name must be PascalCase")
    .optional()
    .describe("Exported component name; defaults to <Client><ComponentType>"),
  title: PlainTextSchema(80).optional().describe("Default heading / title text"),
  description: PlainTextSchema(200).optional().describe("Default supporting text"),
  density: z
    .enum(["comfortable", "compact"])
    .default("comfortable")
    .describe("Spacing density"),
  notes: z
    .array(PlainTextSchema(200))
    .max(10)
    .default([])
    .describe("Implementation notes, emitted as JSDoc on the component"),
});

export const CompileComponentInputSchema = z.strictObject({
  component_type: z.enum(COMPONENT_TYPES).describe("Which governed component to compile"),
  client_id: ClientIdSchema.describe("Client whose tokens (tulip://tokens/{client_id}) theme the output"),
  custom_requirements: CustomRequirementsSchema.default({ density: "comfortable", notes: [] }),
});

export type CompileComponentInput = z.output<typeof CompileComponentInputSchema>;
type CustomRequirements = CompileComponentInput["custom_requirements"];

export const CompileComponentOutputSchema = z.object({
  component_type: z.enum(COMPONENT_TYPES),
  client_id: z.string(),
  component_name: z.string(),
  file_name: z.string(),
  code: z.string(),
  dependencies: z.object({
    shadcn: z.array(z.string()),
    npm: z.array(z.string()),
  }),
  governance: z.object({
    rules: z.array(z.string()),
    violations: z.array(z.string()),
  }),
});

export type CompileComponentOutput = z.output<typeof CompileComponentOutputSchema>;

export class GovernanceError extends Error {
  constructor(readonly violations: string[]) {
    super(`Generated code violates taste governance:\n- ${violations.join("\n- ")}`);
  }
}

// --- Helpers ---

function pascalCase(value: string) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function kebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** A JS string literal, safe to place inside `{...}` in JSX. */
const str = (value: string) => JSON.stringify(value);

function themeConst(vars: Record<string, string>) {
  const entries = Object.entries(vars)
    .map(([name, value]) => `  ${str(name)}: ${str(value)},`)
    .join("\n");
  return `// Client tokens mapped onto the shadcn CSS variables.\nconst theme = {\n${entries}\n} as React.CSSProperties`;
}

function docComment(summary: string, notes: string[]) {
  const lines = [summary, ...(notes.length ? ["", ...notes.map((note) => `- ${note}`)] : [])];
  return `/**\n${lines.map((line) => ` * ${line.replaceAll("*/", "*\\/")}`.trimEnd()).join("\n")}\n */`;
}

type Template = {
  defaults: { title: string; description: string };
  tokenComponents: TokenComponent[];
  shadcn: string[];
  render: (ctx: RenderContext) => string;
};

type RenderContext = {
  name: string;
  title: string;
  description: string;
  compact: boolean;
  doc: string;
};

const FOCUS = FOCUS_RING;
const ICON = ICON_SIZE.default;
const ICON_LG = ICON_SIZE.lg;

// --- Templates ---

const TEMPLATES: Record<ComponentType, Template> = {
  "data-table": {
    defaults: { title: "Records", description: "Search and page through records." },
    tokenComponents: ["card", "input", "button"],
    shadcn: ["button", "card", "input", "table"],
    render: ({ name, title, description, compact, doc }) => `import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

__THEME__

export type ${name}Column<Row> = {
  key: keyof Row & string
  header: string
  align?: "left" | "right"
}

export type ${name}Props<Row extends Record<string, React.ReactNode>> = {
  rows: Row[]
  columns: ${name}Column<Row>[]
  getRowId: (row: Row) => string
  pageSize?: number
  title?: string
  description?: string
}

${doc}
export function ${name}<Row extends Record<string, React.ReactNode>>({
  rows,
  columns,
  getRowId,
  pageSize = 10,
  title = ${str(title)},
  description = ${str(description)},
}: ${name}Props<Row>) {
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(0)

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      columns.some((column) =>
        String(row[column.key] ?? "").toLowerCase().includes(needle)
      )
    )
  }, [rows, columns, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
    setPage(0)
  }

  return (
    <div style={theme} className="${FONT_BODY} text-foreground">
      <Card>
        <CardHeader>
          <CardTitle className="${FONT_HEADING} text-lg font-semibold">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col ${compact ? "gap-3" : "gap-4"}">
          <div className="relative max-w-sm">
            <SearchIcon
              className="${ICON} pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search…"
              aria-label={"Search " + title}
              className="pl-8 ${FOCUS}"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={column.align === "right" ? "text-right" : undefined}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No results.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((row) => (
                  <TableRow key={getRowId(row)}>
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={column.align === "right" ? "${compact ? "py-1.5 " : ""}text-right tabular-nums" : "${compact ? "py-1.5" : ""}"}
                      >
                        {row[column.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Page {currentPage + 1} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 0}
                className="${FOCUS}"
              >
                <ChevronLeftIcon data-icon="inline-start" className="${ICON}" aria-hidden="true" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
                className="${FOCUS}"
              >
                Next
                <ChevronRightIcon data-icon="inline-end" className="${ICON}" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
`,
  },

  "stats-grid": {
    defaults: { title: "Overview", description: "Key metrics for the current period." },
    tokenComponents: ["card", "button"],
    shadcn: ["button", "card"],
    render: ({ name, title, description, compact, doc }) => `import {
  ArrowRightIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

__THEME__

export type ${name}Stat = {
  id: string
  label: string
  value: string
  /** Change versus the previous period, in percent. */
  delta?: number
  icon?: LucideIcon
}

export type ${name}Props = {
  stats: ${name}Stat[]
  title?: string
  description?: string
  onViewReport?: () => void
}

function formatDelta(delta: number) {
  return (delta > 0 ? "+" : "") + delta.toFixed(1) + "%"
}

${doc}
export function ${name}({
  stats,
  title = ${str(title)},
  description = ${str(description)},
  onViewReport,
}: ${name}Props) {
  const headingId = React.useId()

  return (
    <section
      style={theme}
      aria-labelledby={headingId}
      className="${FONT_BODY} flex flex-col ${compact ? "gap-3" : "gap-4"} text-foreground"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="${FONT_HEADING} text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {onViewReport ? (
          <Button variant="outline" onClick={onViewReport} className="${FOCUS}">
            View report
            <ArrowRightIcon data-icon="inline-end" className="${ICON}" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="grid ${compact ? "gap-3" : "gap-4"} sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const StatIcon = stat.icon
          const TrendIcon = (stat.delta ?? 0) < 0 ? TrendingDownIcon : TrendingUpIcon

          return (
            <Card key={stat.id}>
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  {StatIcon ? <StatIcon className="${ICON}" aria-hidden="true" /> : null}
                  {stat.label}
                </CardDescription>
                <CardTitle className="${FONT_HEADING} text-2xl font-semibold tabular-nums">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              {stat.delta !== undefined ? (
                <CardContent>
                  <p
                    className={cn(
                      "flex items-center gap-1 text-sm font-medium",
                      stat.delta < 0 ? "text-destructive" : "text-primary"
                    )}
                  >
                    <TrendIcon className="${ICON}" aria-hidden="true" />
                    {formatDelta(stat.delta)}
                    <span className="sr-only">versus previous period</span>
                  </p>
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>
    </section>
  )
}
`,
  },

  "form-wizard": {
    defaults: { title: "Setup", description: "Complete each step to continue." },
    tokenComponents: ["card", "input", "button"],
    shadcn: ["button", "card", "input", "label", "progress"],
    render: ({ name, title, description, compact, doc }) => `import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"

__THEME__

export type ${name}Field = {
  name: string
  label: string
  type?: "text" | "email" | "number" | "tel" | "url"
  required?: boolean
  placeholder?: string
}

export type ${name}Step = {
  id: string
  title: string
  description?: string
  fields: ${name}Field[]
}

export type ${name}Values = Record<string, string>

export type ${name}Props = {
  steps: ${name}Step[]
  onSubmit: (values: ${name}Values) => void | Promise<void>
  title?: string
  description?: string
  initialValues?: ${name}Values
}

${doc}
export function ${name}({
  steps,
  onSubmit,
  title = ${str(title)},
  description = ${str(description)},
  initialValues = {},
}: ${name}Props) {
  const idPrefix = React.useId()
  const [stepIndex, setStepIndex] = React.useState(0)
  const [values, setValues] = React.useState<${name}Values>(initialValues)
  const [submitting, setSubmitting] = React.useState(false)

  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1
  const progress = ((stepIndex + 1) / steps.length) * 100

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isLast) {
      setStepIndex(stepIndex + 1)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setSubmitting(false)
    }
  }

  if (!step) return null

  return (
    <div style={theme} className="${FONT_BODY} text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader className="${compact ? "gap-2" : "gap-3"}">
          <p className="text-sm text-muted-foreground">
            {title} · Step {stepIndex + 1} of {steps.length}
          </p>
          <CardTitle className="${FONT_HEADING} text-lg font-semibold">{step.title}</CardTitle>
          <CardDescription>{step.description ?? description}</CardDescription>
          <Progress value={progress} aria-label={title + " progress"} />
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col ${compact ? "gap-3" : "gap-4"}">
            {step.fields.map((field) => {
              const fieldId = idPrefix + "-" + field.name
              return (
                <div key={field.name} className="flex flex-col gap-2">
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <Input
                    id={fieldId}
                    name={field.name}
                    type={field.type ?? "text"}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ""}
                    onChange={handleChange}
                    className="${FOCUS}"
                  />
                </div>
              )
            })}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex(stepIndex - 1)}
              disabled={stepIndex === 0 || submitting}
              className="${FOCUS}"
            >
              <ArrowLeftIcon data-icon="inline-start" className="${ICON}" aria-hidden="true" />
              Back
            </Button>
            {isLast ? (
              <Button type="submit" disabled={submitting} className="${FOCUS}">
                {submitting ? (
                  <Loader2Icon data-icon="inline-start" className="${ICON} animate-spin" aria-hidden="true" />
                ) : (
                  <CheckIcon data-icon="inline-start" className="${ICON}" aria-hidden="true" />
                )}
                Submit
              </Button>
            ) : (
              <Button type="submit" className="${FOCUS}">
                Next
                <ArrowRightIcon data-icon="inline-end" className="${ICON}" aria-hidden="true" />
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
`,
  },

  "navigation-sidebar": {
    defaults: { title: "Navigation", description: "Primary navigation." },
    tokenComponents: ["navbar", "button", "tooltip"],
    shadcn: ["badge", "button"],
    render: ({ name, title, compact, doc }) => `import { PanelLeftCloseIcon, PanelLeftOpenIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

__THEME__

export type ${name}Item = {
  href: string
  label: string
  icon: LucideIcon
  badge?: string
}

export type ${name}Props = {
  items: ${name}Item[]
  activeHref?: string
  title?: string
  defaultCollapsed?: boolean
}

${doc}
export function ${name}({
  items,
  activeHref,
  title = ${str(title)},
  defaultCollapsed = false,
}: ${name}Props) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon

  return (
    <aside
      style={theme}
      data-collapsed={collapsed}
      className={cn(
        "${FONT_BODY} flex h-full flex-col gap-2 border-r bg-background ${compact ? "p-2" : "p-3"} text-foreground transition-[width]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {collapsed ? null : (
          <h2 className="${FONT_HEADING} truncate px-2 text-sm font-semibold">{title}</h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="${FOCUS}"
        >
          <ToggleIcon className="${ICON}" aria-hidden="true" />
        </Button>
      </div>
      <nav aria-label={title}>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const ItemIcon = item.icon
            const active = item.href === activeHref

            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "${FOCUS} flex items-center gap-3 rounded-md px-2 ${compact ? "py-1.5" : "py-2"} text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  )}
                >
                  <ItemIcon className="${ICON_LG} shrink-0" aria-hidden="true" />
                  {collapsed ? (
                    <span className="sr-only">{item.label}</span>
                  ) : (
                    <span className="truncate">{item.label}</span>
                  )}
                  {item.badge && !collapsed ? (
                    <Badge variant="secondary" className="ml-auto">
                      {item.badge}
                    </Badge>
                  ) : null}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
`,
  },

  "modal-dialog": {
    defaults: { title: "Create item", description: "Fill in the details, then confirm." },
    tokenComponents: ["dialog", "button"],
    shadcn: ["button", "dialog"],
    render: ({ name, title, description, doc }) => `import { Loader2Icon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

__THEME__

export type ${name}Props = {
  onConfirm: () => void | Promise<void>
  children?: React.ReactNode
  triggerLabel?: string
  title?: string
  description?: string
  confirmLabel?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

${doc}
export function ${name}({
  onConfirm,
  children,
  triggerLabel = ${str(title)},
  title = ${str(title)},
  description = ${str(description)},
  confirmLabel = "Confirm",
  open,
  onOpenChange,
}: ${name}Props) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const isOpen = open ?? internalOpen

  function handleOpenChange(next: boolean) {
    if (pending) return
    setInternalOpen(next)
    onOpenChange?.(next)
  }

  async function handleConfirm() {
    setPending(true)
    try {
      await onConfirm()
    } finally {
      setPending(false)
    }
    setInternalOpen(false)
    onOpenChange?.(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" style={theme} className="${FONT_BODY} ${FOCUS}">
          <PlusIcon data-icon="inline-start" className="${ICON_LG}" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent style={theme} className="${FONT_BODY} text-foreground">
        <DialogHeader>
          <DialogTitle className="${FONT_HEADING} text-lg font-semibold">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending} className="${FOCUS}">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleConfirm} disabled={pending} className="${FOCUS}">
            {pending ? (
              <Loader2Icon data-icon="inline-start" className="${ICON} animate-spin" aria-hidden="true" />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
`,
  },
};

// --- Compile ---

export function compileComponent(
  input: CompileComponentInput,
  tokens: ThemeTokens,
): CompileComponentOutput {
  const template = TEMPLATES[input.component_type];
  const requirements: CustomRequirements = input.custom_requirements;
  const name =
    requirements.component_name ?? pascalCase(`${input.client_id} ${input.component_type}`);

  const body = template.render({
    name,
    title: requirements.title ?? template.defaults.title,
    description: requirements.description ?? template.defaults.description,
    compact: requirements.density === "compact",
    doc: docComment(
      `${input.component_type} for client "${input.client_id}", themed from tulip://tokens/${input.client_id}.`,
      requirements.notes,
    ),
  });

  const code = [
    `// Generated by tulip-mcp compile_component (${input.component_type}, client "${input.client_id}").`,
    `// Taste governance: icons ${ICON_SIZE.default}/${ICON_SIZE.lg}, fonts via --font-heading/--font-body, focus rings ring-2 ring-primary.`,
    `"use client"`,
    ``,
    `import * as React from "react"`,
    // Function replacer: token values must never be read as `$&`-style patterns.
    body.replace("__THEME__", () => themeConst(themeVariables(tokens, template.tokenComponents))),
  ].join("\n");

  const violations = auditTaste(code);
  if (violations.length) {
    throw new GovernanceError(violations);
  }

  return {
    component_type: input.component_type,
    client_id: input.client_id,
    component_name: name,
    file_name: `components/generated/${kebabCase(name)}.tsx`,
    code,
    dependencies: { shadcn: template.shadcn, npm: ["lucide-react"] },
    governance: { rules: [...GOVERNANCE_RULES], violations },
  };
}
