/** Map marker culling: drawn markers stay this much further out than the visible bounds, as a share of the view per side. */
export const cullingRules = {
  marginShare: 0.25,
};

/** Sight range setting: multipliers on how far sanctums, taverns and places show. ×3 keeps 1200 m + snapping inside the 4.9 km a precision 5 tile and its neighbours cover. */
export const sightRules = { choices: [1, 2, 3] };
