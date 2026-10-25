// Each bounded submission retains the original global pixel/line index.
// In particular, grain RNG streams and recursive blur line ownership do not change.
layout(push_constant) uniform DispatchOffset { uint base_index; } spk_dispatch;
uint spk_global_index() {
    return spk_dispatch.base_index + gl_GlobalInvocationID.y *
        (gl_NumWorkGroups.x * gl_WorkGroupSize.x) + gl_GlobalInvocationID.x;
}
