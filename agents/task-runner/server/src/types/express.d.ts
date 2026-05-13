import "express-serve-static-core";

type PaperclipActorSource = "none" | "local_implicit" | "session" | "agent_key" | "agent_jwt";

type PaperclipActor = {
  type: "none" | "board" | "agent";
  source: PaperclipActorSource;
  userId?: string;
  agentId?: string;
  companyId?: string;
  companyIds?: string[];
  keyId?: string;
  runId?: string;
  isInstanceAdmin?: boolean;
};

declare module "express-serve-static-core" {
  interface Request {
    actor: PaperclipActor;
  }
}

declare global {
  namespace Express {
    interface Request {
      actor: PaperclipActor;
    }
  }
}
