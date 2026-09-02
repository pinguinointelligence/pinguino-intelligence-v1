# GELLATTI — end-to-end QA artifacts

## `screenshots/`

The autonomous acceptance run drove the application through a browser
automation tool that returns screenshots **inline to the operator**, not as
files on disk. There is no bridge from that tool to the filesystem, so this
directory carries **textual capture files** instead of images: the rendered
text of each surface plus the assertions made against it.

For regression purposes the textual capture is the stronger artifact — a
screenshot cannot be diffed or asserted, and a rendered-text capture can.
Where a visual check mattered (mobile overflow, the approved design on new
surfaces) the assertion is recorded as a measurement rather than a picture,
e.g. `scrollWidth === clientWidth === 390`.

## `eu-labels/`

Empty by design in this run. The EU label workspace correctly refuses to print
while any nutrient on the panel would be a substituted value, and four
canonical Mapper articles used by the standard Gelato base carry no confirmed
saturated-fat figure. No label PDF was produced because none could be produced
honestly — see blocker 2 in `../GELLATTI_BLOCKERS.md`. Nothing was invented to
fill the gap.
