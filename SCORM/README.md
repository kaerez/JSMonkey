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
| Moodle | ✅ |
| H5P | ✅ |
| EC-Council iClass | ✅ |
| KnowBe4 / security awareness platforms | ✅ |
| BAI / ProSight Learning Manager | ✅ |
| Teachable | ⚠️ |
| Cybrary | ⚠️ |
| EC-Council CodeRed | ⚠️ |
| Canvas LMS | ⚠️ |
| Thinkific | ⚠️ |
| Vimeo-embedded players | ⚠️ |
| Wistia-embedded players | ⚠️ |
| Pluralsight | ⚠️ |
| ProProfs (LMS-embedded) | ⚠️ |
| Quizizz (via LMS/LTI) | ⚠️ |

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
| **Moodle** | `M.core_completion.init` override, `Y.io` hook, `$.ajaxPrefilter` — completion AJAX payloads mutated |
| **H5P** | `H5P.externalDispatcher.trigger` hook — xAPI statements mutated before dispatch |
| **EC-Council iClass** | SCORM-based platform — covered by SCORM hooks above |
| **KnowBe4 / security awareness platforms** | SCORM-based delivery — covered by SCORM hooks above |
| **BAI / ProSight Learning Manager** | SCORM + AICC delivery — covered above |

<br>

### ⚠️ Partially Supported
Video completion and progress tracking are fully intercepted. **Quiz scores and server-graded assessments are not affected** — those require correctly answered questions.

| Platform | What works | What doesn't |
|---|---|---|
| **Teachable** | Video lecture completion (bypasses 90% watch requirement), lecture unlock progression, course completion certificate on video-only courses | Mandatory quiz minimum scores |
| **Cybrary** | Video lesson completion, course progress at 100% | Lab completion, graded assessments |
| **EC-Council CodeRed** | Video lesson completion | Hands-on labs, challenge completion |
| **Canvas LMS** | `must_mark_done` module items marked complete via Valence PUT | `must_submit` assignments, `min_score` requirements |
| **Thinkific** | Video completion via HTML5 video hook | Quiz score requirements |
| **Vimeo-embedded players** | `timeupdate` postMessages rewritten to 100%, iframe seek commands, Vimeo SDK proxy | Anything graded by the host platform separately |
| **Wistia-embedded players** | `video.time(duration)` seek, `percentWatched()` overridden to 1.0 | Host-platform quiz/assessment gates |
| **Pluralsight** | Video lesson completion | Skill assessments and IQ scores |
| **ProProfs (LMS-embedded)** | When ProProfs quiz is embedded as a SCORM package inside an LMS — fully intercepted via SCORM hooks | Quizzes accessed directly on proprofs.com are server-graded |
| **Quizizz (via LMS/LTI)** | When launched via Canvas or Moodle LTI — LTI grade passback intercepted via postMessage hook | Standalone quizizz.com play is server-side |

**What partial support means in practice:** navigating through the course and closing/submitting will record completion. The progress bar and completion certificate reflect 100%. Any quiz or assessment that the platform grades server-side based on your actual answers is not affected.
