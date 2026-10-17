export type PipelineStepStatus = "pending" | "active" | "completed";

export type PipelineStep = {
  id: string;
  label: string;
  status: PipelineStepStatus;
};

export type ProjectStatus =
  | "pending_approval"
  | "processing"
  | "delivered";

export type Project = {
  id: string;
  userId: string;
  status: ProjectStatus;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  layoutType: string;
  features: string[];
  pipelineSteps: PipelineStep[];
  processingStartedAt: string | null;
  deliveredAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  figmaFileUrl: string | null;
  figmaFileName: string | null;
  githubUrl: string | null;
  zipFileUrl: string | null;
  zipFileName: string | null;
  s3Bucket: string | null;
  createdAt: string;
  updatedAt: string;
  secondsRemaining: number;
  processingDeadline: string | null;
};

export type IntakeBriefPayload = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  layoutType: string;
  features: string[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data as T;
}

export async function getMyProject() {
  return apiFetch<{ project: Project | null }>("/api/projects/me");
}

export async function submitIntakeBrief(payload: IntakeBriefPayload) {
  return apiFetch<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
