SCORM PASS
==========
[Return to home page](/README.md)
<br>

Prerequisite
------------
[Tampermonkey](https://www.tampermonkey.net/)
<br>

Installation
------------
Click [here](https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js) to install this script
<br>

Use
---
1. Open the course in your browser and wait for it to load
2. Press **Ctrl + right-click** anywhere on the page
3. Select **⚡ SCORM Pass** from the context menu
4. Click through or navigate the course normally — hooks persist across page/module navigation
5. Close or submit the course — completion and score are reported as 100%

> Activation is required once per page load. After activating, all subsequent navigation within the course (Next, Previous, module changes) is covered automatically.

<br>

Support
-------

| Platform / Protocol | Status |
|---|:---:|
| SCORM 1.2 | ✅ |
| SCORM 2004 | ✅ |
| xAPI / Tin Can | ✅ |
| cmi5 | ✅ |
| AICC | ✅ |
| Udutu | ✅ |
| D2L Brightspace (SCORM content) | ✅ |
| Articulate Storyline / Rise | ✅ |
| Adobe Captivate | ✅ |
| Lectora | ✅ |
| iSpring Suite | ✅ |
| Moodle | ✅ |
| Totara LMS | ✅ |
| H5P | ✅ |
| Blackboard Learn | ✅ |
| Canvas LMS (SCORM content) | ✅ |
| Docebo | ✅ |
| TalentLMS | ✅ |
| Absorb LMS | ✅ |
| Cornerstone OnDemand | ✅ |
| Workday Learning | ✅ |
| SAP SuccessFactors Learning | ✅ |
| Saba Learning / SumTotal | ✅ |
| Litmos | ✅ |
| LearnUpon | ✅ |
| Adobe Learning Manager | ✅ |
| LearnDash (WordPress) | ✅ |
| 360Learning | ✅ |
| Bridge LMS | ✅ |
| SC Training (formerly EdApp) | ✅ |
| Skillsoft Percipio (custom/SCORM content) | ✅ |
| Paradiso LMS | ✅ |
| Open edX (SCORM plugin) | ✅ |
| HealthStream | ✅ |
| Relias Learning | ✅ |
| Infosec IQ / Proofpoint Security Awareness | ✅ |
| SANS Security Awareness | ✅ |
| Mimecast Awareness Training | ✅ |
| EC-Council iClass | ✅ |
| KnowBe4 / security awareness platforms | ✅ |
| BAI / ProSight Learning Manager | ✅ |
| Any SCORM / xAPI / AICC / cmi5 platform | ✅ |
| Teachable | ⚠️ |
| Cybrary | ⚠️ |
| EC-Council CodeRed | ⚠️ |
| Canvas LMS (module completion) | ⚠️ |
| Thinkific | ⚠️ |
| LearnWorlds (video content) | ⚠️ |
| Kajabi | ⚠️ |
| Podia | ⚠️ |
| FutureLearn | ⚠️ |
| MasterClass | ⚠️ |
| Vimeo-embedded players | ⚠️ |
| Wistia-embedded players | ⚠️ |
| Pluralsight | ⚠️ |
| HubSpot Academy | ⚠️ |
| Udacity | ⚠️ |
| Skillshare | ⚠️ |
| Skillsoft Percipio (native video content) | ⚠️ |
| Udemy Business (via LMS/xAPI) | ⚠️ |
| ProProfs (LMS-embedded) | ⚠️ |
| Quizizz (via LMS/LTI) | ⚠️ |
| Any HTML5 video-based platform | ⚠️ |

✅ Fully supported — completion, score and pass/fail recorded server-side as 100%/passed  
⚠️ Partially supported — video/lecture completion works; server-graded quizzes and labs are not affected

<br>

### ✅ Fully Supported
Complete interception at every layer — completion status, score, and pass/fail are all recorded as 100%/passed server-side.

| Protocol / Platform | Notes |
|---|---|
| **SCORM 1.2** | `lesson_status=passed`, `score.raw=100` — persists across SPA navigation via API reassignment setter trap |
| **SCORM 2004** | `completion_status=completed`, `success_status=passed`, `score.scaled=1.0` — same persistence |
| **xAPI / Tin Can** | Network-level: `result.completion=true`, `result.success=true`, `score.scaled=1.0`, failed verbs rewritten to passed |
| **cmi5** | Covered by xAPI network interceptor |
| **AICC** | HACP `PutParam` body mutated: `lesson_status=passed`, `score=100` |
| **Udutu** | In-memory `gblScreens` arrays forced; `setModuleCompleted` / `evaluateCourseCompletion` called |
| **D2L Brightspace (SCORM content)** | SCORM hooks + `d2l-sequence-viewer` JWT POST + `D2L.LP.Web.UI.Rpc` / `MasterPage` namespace hooks |
| **Articulate Storyline / Rise** | `window.player` / `GetPlayer()` proxy: `reportStatus('complete')`, `reportScore(100,100)`, `SetVar` intercept |
| **Adobe Captivate** | `cpAPIInterface.setVariableValue` hook: `cpQuizInfoPassFail=1`, points forced to max |
| **Lectora** | `window.AICC_Lesson_Status`, `AICC_Score`, `CMI_Completion_Status`, `CMI_Success_Status` property traps — installed passively at page load |
| **iSpring Suite** | Publishes to SCORM 1.2/2004, xAPI, AICC, cmi5 — all output formats covered by existing hooks |
| **Moodle** | `M.core_completion.init` override, `Y.io` hook, `$.ajaxPrefilter` — completion AJAX payloads mutated |
| **Totara LMS** | Moodle-based — covered by both SCORM and Moodle hooks |
| **H5P** | `H5P.externalDispatcher.trigger` hook — xAPI statements mutated before dispatch |
| **Blackboard Learn** | SCORM 1.2/2004 + AICC delivery — covered by SCORM/AICC hooks |
| **Canvas LMS (SCORM content)** | SCORM hooks cover content layer; see ⚠️ for native module completion |
| **Docebo** | SCORM 1.2/2004 + xAPI LMS — SCORM hooks cover content layer |
| **TalentLMS** | SCORM + xAPI + cmi5 — all covered |
| **Absorb LMS** | SCORM + xAPI — covered |
| **Cornerstone OnDemand** | SCORM 1.2/2004 + xAPI + AICC — all covered |
| **Workday Learning** | SCORM 1.2/2004 — covered |
| **SAP SuccessFactors Learning** | SCORM + xAPI — covered |
| **Saba Learning / SumTotal** | SCORM + xAPI delivery (now under Cornerstone) — covered |
| **Litmos** | SCORM + xAPI — covered |
| **LearnUpon** | SCORM + xAPI + cmi5 — covered |
| **Adobe Learning Manager** | SCORM + xAPI — covered |
| **LearnDash (WordPress)** | SCORM + xAPI via plugin — covered |
| **360Learning** | SCORM + xAPI + cmi5 + AICC — covered |
| **Bridge LMS** | SCORM + xAPI — covered |
| **SC Training (formerly EdApp)** | SCORM-compliant LMS and authoring tool — covered |
| **Skillsoft Percipio (custom/SCORM content)** | Accepts AICC, SCORM, xAPI, cmi5 for custom course packages — covered |
| **Paradiso LMS** | SCORM 1.2 + AICC + xAPI — covered |
| **Open edX (SCORM plugin)** | SCORM plugin delivery — covered by SCORM hooks |
| **HealthStream** | SCORM/xAPI healthcare LMS — covered |
| **Relias Learning** | SCORM/xAPI healthcare compliance — covered |
| **Infosec IQ / Proofpoint Security Awareness** | SCORM-based delivery — covered |
| **SANS Security Awareness** | SCORM/xAPI delivery — covered |
| **Mimecast Awareness Training** | SCORM-based delivery — covered |
| **EC-Council iClass** | SCORM-based platform — covered by SCORM hooks above |
| **KnowBe4 / security awareness platforms** | SCORM-based delivery — covered by SCORM hooks above |
| **BAI / ProSight Learning Manager** | SCORM + AICC delivery — covered above |
| **Any SCORM / xAPI / AICC / cmi5 platform** | The script intercepts at the protocol level — any LMS or platform delivering content via these standards is fully covered regardless of whether it is explicitly listed above |

<br>

### ⚠️ Partially Supported
Video completion and progress tracking are fully intercepted. **Quiz scores, labs, and server-graded assessments are not affected** — those require correctly answered questions.

| Platform | What works | What doesn't |
|---|---|---|
| **Teachable** | Video lecture completion (bypasses 90% watch requirement), lecture unlock progression, course completion certificate on video-only courses | Mandatory quiz minimum scores |
| **Cybrary** | Video lesson completion, course progress at 100% | Lab completion, graded assessments |
| **EC-Council CodeRed** | Video lesson completion | Hands-on labs, challenge completion |
| **Canvas LMS (module completion)** | `must_mark_done` module items marked complete via Valence PUT | `must_submit` assignments, `min_score` requirements |
| **Thinkific** | Video completion via HTML5 video hook | Quiz score requirements |
| **LearnWorlds (video content)** | Video completion via HTML5 video hook; SCORM-packaged content fully covered | Quiz and assessment score requirements |
| **Kajabi** | Video lesson completion via HTML5 video hook | No SCORM support; quiz scores server-graded |
| **Podia** | Video lesson completion via HTML5 video hook | No assessment layer to bypass |
| **FutureLearn** | Video lesson completion via HTML5 video hook | Assessed courses require correct answers |
| **MasterClass** | Video lesson completion via HTML5 video hook | No assessment layer |
| **Vimeo-embedded players** | `timeupdate` postMessages rewritten to 100%, iframe seek commands, Vimeo SDK proxy | Anything graded by the host platform separately |
| **Wistia-embedded players** | `video.time(duration)` seek, `percentWatched()` overridden to 1.0 | Host-platform quiz/assessment gates |
| **Pluralsight** | Video lesson completion | Skill assessments and IQ scores |
| **HubSpot Academy** | Video lesson completion via HTML5 + Wistia hook | Certification exams require passing actual exams |
| **Udacity** | Video lesson completion | Projects graded by human reviewers |
| **Skillshare** | Video lesson completion | No assessment layer |
| **Skillsoft Percipio (native video)** | Video completion via HTML5 video hook | Native Skillsoft content tracks server-side; Skill Benchmarks are server-graded |
| **Udemy Business (via LMS/xAPI)** | When integrated with an LMS (Cornerstone, SuccessFactors, etc.) — xAPI progress/completion statements intercepted via network layer | Standalone udemy.com is fully server-side |
| **ProProfs (LMS-embedded)** | When ProProfs quiz is embedded as a SCORM package inside an LMS — fully intercepted via SCORM hooks | Quizzes accessed directly on proprofs.com are server-graded |
| **Quizizz (via LMS/LTI)** | When launched via Canvas or Moodle LTI — LTI grade passback intercepted via postMessage hook | Standalone quizizz.com play is server-side |
| **Any HTML5 video-based platform** | Video completion, progress tracking, and lecture/module unlock — HTML5 video hook forces `ended` event and 100% progress on all `<video>` elements | Server-graded quizzes and assessments embedded in the same platform |

**What partial support means in practice:** navigating through the course and closing/submitting will record completion. The progress bar and completion certificate reflect 100%. Any quiz, assessment, or lab that the platform grades server-side based on your actual answers is not affected.
