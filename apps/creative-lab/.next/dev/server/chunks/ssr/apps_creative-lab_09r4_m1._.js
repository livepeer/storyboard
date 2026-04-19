module.exports = [
"[project]/apps/creative-lab/lib/missions/catalog.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MISSIONS",
    ()=>MISSIONS,
    "getMission",
    ()=>getMission
]);
const MISSIONS = [
    {
        id: "dream-pet",
        title: "My Dream Pet",
        description: "Imagine and create your perfect fantasy pet!",
        icon: "🐾",
        difficulty: "starter",
        category: "image",
        maxStars: 3,
        steps: [
            {
                id: "describe",
                type: "text_input",
                instruction: "What does your dream pet look like? Describe its colors, size, and any magical features!",
                hint: "Think about what makes your pet special — maybe it has wings, glows in the dark, or has rainbow fur!"
            },
            {
                id: "generate",
                type: "generate",
                instruction: "Let's bring your dream pet to life!",
                hint: "The AI will paint your pet based on your description.",
                capability: "flux-dev",
                autoPromptPrefix: "cute child-friendly cartoon illustration, colorful, friendly, "
            },
            {
                id: "review",
                type: "review",
                instruction: "Take a look at your dream pet! Do you love it?",
                hint: "You can go back and try again with a different description if you want."
            },
            {
                id: "celebrate",
                type: "celebrate",
                instruction: "Amazing! You created your dream pet! 🎉"
            }
        ]
    },
    {
        id: "superhero",
        title: "Superhero Portrait",
        description: "Design your own superhero and give them an epic power effect!",
        icon: "🦸",
        difficulty: "starter",
        category: "image",
        maxStars: 3,
        steps: [
            {
                id: "describe",
                type: "text_input",
                instruction: "Describe your superhero! What do they look like? What's their costume like?",
                hint: "Think about colors, a cool mask, a cape, or any special details that make them unique!"
            },
            {
                id: "generate",
                type: "generate",
                instruction: "Time to create your superhero!",
                hint: "The AI will draw your hero in an epic pose.",
                capability: "flux-dev",
                autoPromptPrefix: "epic superhero portrait, child-friendly cartoon style, dynamic pose, bright colors, "
            },
            {
                id: "transform",
                type: "transform",
                instruction: "Add an epic power effect to your superhero!",
                hint: "Try: 'add lightning bolts', 'surround with flames', 'add glowing energy aura'",
                capability: "kontext-edit",
                action: "restyle"
            },
            {
                id: "celebrate",
                type: "celebrate",
                instruction: "Your superhero is ready to save the day! 🦸‍♀️💥"
            }
        ]
    },
    {
        id: "funny-animal",
        title: "Funny Animal Moment",
        description: "Create a hilarious cartoon of an animal in a silly situation!",
        icon: "🤣",
        difficulty: "starter",
        category: "image",
        maxStars: 3,
        steps: [
            {
                id: "describe",
                type: "text_input",
                instruction: "What animal is it and what funny thing are they doing?",
                hint: "Examples: 'a cat wearing sunglasses eating pizza', 'a dog trying to drive a rocket ship', 'a frog playing a tiny guitar'"
            },
            {
                id: "generate",
                type: "generate",
                instruction: "Let's make the funniest cartoon ever!",
                hint: "The AI will draw your silly animal scene.",
                capability: "flux-dev",
                autoPromptPrefix: "hilarious cartoon, child-friendly humor, vibrant colors, exaggerated expressions, "
            },
            {
                id: "celebrate",
                type: "celebrate",
                instruction: "Ha! That's hilarious! You're a comedy genius! 🤣🎨"
            }
        ]
    }
];
const MISSION_MAP = new Map(MISSIONS.map((m)=>[
        m.id,
        m
    ]));
function getMission(id) {
    return MISSION_MAP.get(id);
}
;
}),
"[project]/apps/creative-lab/lib/stores/progress-store.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useProgressStore",
    ()=>useProgressStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/react.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/middleware.mjs [app-ssr] (ecmascript)");
;
;
const useProgressStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
        progress: [],
        totalStars: 0,
        startMission: (missionId)=>{
            const now = Date.now();
            set((state)=>{
                const existing = state.progress.find((p)=>p.missionId === missionId);
                let newProgress;
                if (existing) {
                    // Reset progress for this mission
                    newProgress = state.progress.map((p)=>p.missionId === missionId ? {
                            ...p,
                            currentStep: 0,
                            completed: false,
                            stars: 0,
                            artifacts: [],
                            startedAt: now,
                            completedAt: undefined
                        } : p);
                } else {
                    newProgress = [
                        ...state.progress,
                        {
                            missionId,
                            currentStep: 0,
                            completed: false,
                            stars: 0,
                            artifacts: [],
                            startedAt: now
                        }
                    ];
                }
                return {
                    progress: newProgress
                };
            });
        },
        advanceStep: (missionId)=>{
            set((state)=>({
                    progress: state.progress.map((p)=>p.missionId === missionId ? {
                            ...p,
                            currentStep: p.currentStep + 1
                        } : p)
                }));
        },
        completeMission: (missionId, stars)=>{
            set((state)=>{
                const newProgress = state.progress.map((p)=>{
                    if (p.missionId !== missionId) return p;
                    return {
                        ...p,
                        completed: true,
                        stars: Math.max(p.stars, stars),
                        completedAt: Date.now()
                    };
                });
                const totalStars = newProgress.reduce((sum, p)=>sum + p.stars, 0);
                return {
                    progress: newProgress,
                    totalStars
                };
            });
        },
        addArtifact: (missionId, artifactRefId)=>{
            set((state)=>({
                    progress: state.progress.map((p)=>p.missionId === missionId ? {
                            ...p,
                            artifacts: [
                                ...p.artifacts,
                                artifactRefId
                            ]
                        } : p)
                }));
        },
        getProgress: (missionId)=>{
            return get().progress.find((p)=>p.missionId === missionId);
        },
        isMissionUnlocked: (missionId, unlockAfter)=>{
            if (!unlockAfter || unlockAfter.length === 0) return true;
            const { progress } = get();
            return unlockAfter.every((prerequisiteId)=>progress.some((p)=>p.missionId === prerequisiteId && p.completed));
        }
    }), {
    name: "creative-lab:progress"
}));
}),
"[project]/apps/creative-lab/components/MissionCard.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MissionCard",
    ()=>MissionCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
const DIFFICULTY_STYLES = {
    starter: {
        label: "Starter",
        bg: "#166534",
        color: "#86efac"
    },
    explorer: {
        label: "Explorer",
        bg: "#1e3a5f",
        color: "#93c5fd"
    },
    creator: {
        label: "Creator",
        bg: "#3b0764",
        color: "#d8b4fe"
    },
    master: {
        label: "Master",
        bg: "#78350f",
        color: "#fcd34d"
    }
};
function MissionCard({ mission, stars, locked, onStart }) {
    const diff = DIFFICULTY_STYLES[mission.difficulty] ?? DIFFICULTY_STYLES.starter;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        onClick: ()=>!locked && onStart(mission.id),
        disabled: locked,
        style: {
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "20px",
            textAlign: "left",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.5 : 1,
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            width: "100%"
        },
        onMouseEnter: (e)=>{
            if (!locked) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
            }
        },
        onMouseLeave: (e)=>{
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "none";
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: "2.5rem",
                    marginBottom: "8px"
                },
                children: locked ? "🔒" : mission.icon
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: "6px"
                },
                children: mission.title
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
                lineNumber: 54,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    marginBottom: "12px",
                    lineHeight: 1.4
                },
                children: mission.description
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                style: {
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: diff.bg,
                    color: diff.color,
                    marginBottom: "12px"
                },
                children: diff.label
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    gap: "4px"
                },
                children: Array.from({
                    length: mission.maxStars
                }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: "1.1rem"
                        },
                        children: i < stars ? "⭐" : "☆"
                    }, i, false, {
                        fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
                        lineNumber: 82,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
                lineNumber: 80,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/creative-lab/components/MissionCard.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/creative-lab/components/MissionPicker.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MissionPicker",
    ()=>MissionPicker
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/catalog.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/stores/progress-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$MissionCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/MissionCard.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
function MissionPicker() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const { totalStars, getProgress, isMissionUnlocked } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useProgressStore"])();
    function handleStart(id) {
        router.push(`/mission/${id}`);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: "960px",
            margin: "0 auto",
            padding: "32px 16px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    marginBottom: "32px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        style: {
                            fontSize: "2rem",
                            fontWeight: 800,
                            color: "var(--text)",
                            marginBottom: "8px"
                        },
                        children: "Pick a Mission! 🚀"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                        lineNumber: 20,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px"
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    fontSize: "1.25rem"
                                },
                                children: "⭐"
                            }, void 0, false, {
                                fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                                lineNumber: 24,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    fontSize: "1.1rem",
                                    fontWeight: 700,
                                    color: "var(--star)"
                                },
                                children: [
                                    totalStars,
                                    " stars earned"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                                lineNumber: 25,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                        lineNumber: 23,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: "20px"
                },
                children: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MISSIONS"].map((mission)=>{
                    const progress = getProgress(mission.id);
                    const stars = progress?.stars ?? 0;
                    const locked = !isMissionUnlocked(mission.id, mission.unlockAfter);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$MissionCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MissionCard"], {
                        mission: mission,
                        stars: stars,
                        locked: locked,
                        onStart: handleStart
                    }, mission.id, false, {
                        fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                        lineNumber: 44,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/creative-lab/components/MissionPicker.tsx",
        lineNumber: 17,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/creative-lab/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$MissionPicker$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/MissionPicker.tsx [app-ssr] (ecmascript)");
"use client";
;
;
function Home() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$MissionPicker$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MissionPicker"], {}, void 0, false, {
        fileName: "[project]/apps/creative-lab/app/page.tsx",
        lineNumber: 6,
        columnNumber: 10
    }, this);
}
}),
];

//# sourceMappingURL=apps_creative-lab_09r4_m1._.js.map