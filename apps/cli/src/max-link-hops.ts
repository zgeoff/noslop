// Linux bounds a path lookup at 40 symlinks, so a link cycle fails at the same bound.
export const MAX_LINK_HOPS = 40;
