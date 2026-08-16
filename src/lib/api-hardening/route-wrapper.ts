import { getApiRoutePolicy } from "./policies";
import { getRequestSubjectKey, recordApiRouteAuditEvent, type ApiAuditOutcome } from "./audit";

type RouteHandler<TArgs extends unknown[]> = (...args: TArgs) => Promise<Response> | Response;

function findRequest(args: unknown[]): Request | undefined {
  return args.find((arg): arg is Request => arg instanceof Request);
}

function outcomeForStatus(status: number): ApiAuditOutcome {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 423) return "blocked";
  if (status >= 500) return "error";
  return "success";
}

export function withApiRoutePolicy<TArgs extends unknown[]>(
  routeId: string,
  method: string,
  handler: RouteHandler<TArgs>,
): RouteHandler<TArgs> {
  const policy = getApiRoutePolicy(routeId);
  const wrapped = async (...args: TArgs): Promise<Response> => {
    const startedAt = Date.now();
    const request = findRequest(args);

    try {
      const response = await handler(...args);
      recordApiRouteAuditEvent({
        policy,
        request,
        method,
        statusCode: response.status,
        outcome: outcomeForStatus(response.status),
        startedAt,
        subjectKey: getRequestSubjectKey(request),
      }).catch(() => {});
      return response;
    } catch (error) {
      recordApiRouteAuditEvent({
        policy,
        request,
        method,
        statusCode: 500,
        outcome: "error",
        startedAt,
        subjectKey: getRequestSubjectKey(request),
        reasonCode: "route_handler_exception",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => {});
      throw error;
    }
  };

  return wrapped;
}
