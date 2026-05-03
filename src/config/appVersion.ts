import { APP_VERSION } from "@/generated/appBuild";

export { APP_VERSION };

export function getAppReleaseLabel(version: string = APP_VERSION): string {
  return version.match(/F\d+/u)?.[0] ?? version;
}

export const APP_RELEASE_LABEL = getAppReleaseLabel(APP_VERSION);
