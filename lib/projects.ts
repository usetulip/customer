import type {
  IntakeBriefPayload,
  PipelineStep,
  Project,
  ProjectStatus,
} from "@/lib/api";

// Server-only access to the `projects` table in Supabase (see
// supabase/migrations). Uses the service role, so callers must authenticate
// the user first and only ever pass that user's id.

export const PROCESSING_DURATION_HOURS = 48;

export const DEFAULT_PIPELINE_STEPS: PipelineStep[] = [
  { id: "brief", label: "Brief Received & Validated", status: "completed" },
  { id: "orchestration", label: "AI Orchestration in Progress", status: "active" },
  { id: "qa", label: "Human QA & Token Sync", status: "pending" },
  { id: "compilation", label: "Asset Compilation", status: "pending" },
];

type ProjectRow = {
  id: string;
  user_id: string;
  status: ProjectStatus;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  layout_type: string;
  features: string[];
  pipeline_steps: PipelineStep[];
  processing_started_at: string | null;
  delivered_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  figma_file_url: string | null;
  figma_file_name: string | null;
  github_url: string | null;
  zip_file_url: string | null;
  zip_file_name: string | null;
  s3_bucket: string | null;
  created_at: string;
  updated_at: string;
};

export class ProjectStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function hasProjectStoreConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function rest<T>(
  path: string,
  options: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: key,
  };
  // Legacy service_role keys are JWTs and go in Authorization too;
  // new `sb_secret_` keys are accepted via `apikey` alone.
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1${path}`,
    {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    },
  );

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ProjectStoreError(
      data?.message ?? "Project store request failed",
      response.status,
      data?.code,
    );
  }

  return data as T;
}

function getProcessingDeadline(startedAt: string | null) {
  if (!startedAt) {
    return null;
  }
  const deadline = new Date(startedAt);
  deadline.setHours(deadline.getHours() + PROCESSING_DURATION_HOURS);
  return deadline;
}

function getSecondsRemaining(startedAt: string | null) {
  const deadline = getProcessingDeadline(startedAt);
  if (!deadline) {
    return PROCESSING_DURATION_HOURS * 60 * 60;
  }
  const diff = Math.floor((deadline.getTime() - Date.now()) / 1000);
  return Math.max(0, diff);
}

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    backgroundColor: row.background_color,
    layoutType: row.layout_type,
    features: row.features,
    pipelineSteps: row.pipeline_steps,
    processingStartedAt: row.processing_started_at,
    deliveredAt: row.delivered_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    figmaFileUrl: row.figma_file_url,
    figmaFileName: row.figma_file_name,
    githubUrl: row.github_url,
    zipFileUrl: row.zip_file_url,
    zipFileName: row.zip_file_name,
    s3Bucket: row.s3_bucket,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    secondsRemaining: getSecondsRemaining(row.processing_started_at),
    processingDeadline:
      getProcessingDeadline(row.processing_started_at)?.toISOString() ?? null,
  };
}

export async function getProjectByUserId(userId: string) {
  const rows = await rest<ProjectRow[]>(
    `/projects?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

export async function createProject(userId: string, input: IntakeBriefPayload) {
  const existing = await getProjectByUserId(userId);
  if (existing && existing.status !== "delivered") {
    return { error: "You already have an active project." as const, project: existing };
  }

  try {
    const [project] = await rest<ProjectRow[]>("/projects", {
      method: "POST",
      prefer: "return=representation",
      body: {
        user_id: userId,
        primary_color: input.primaryColor,
        secondary_color: input.secondaryColor,
        background_color: input.backgroundColor,
        layout_type: input.layoutType,
        features: input.features,
        pipeline_steps: DEFAULT_PIPELINE_STEPS,
        status: "processing",
        processing_started_at: new Date().toISOString(),
      },
    });
    return { project };
  } catch (err) {
    // Lost a race with a concurrent submit: projects_one_active_per_user.
    if (err instanceof ProjectStoreError && err.code === "23505") {
      const active = await getProjectByUserId(userId);
      if (active) {
        return { error: "You already have an active project." as const, project: active };
      }
    }
    throw err;
  }
}
