/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
  AnyComponents,
} from "convex/server";
import type * as agent from "../agent.js";
import type * as roomsInternal from "../roomsInternal.js";
import type * as rooms from "../rooms.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  roomsInternal: typeof roomsInternal;
  rooms: typeof rooms;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

/**
 * Convex components installed on this app. Untyped until `npx convex dev`
 * authenticates and runs a real push.
 */
export declare const components: AnyComponents;
