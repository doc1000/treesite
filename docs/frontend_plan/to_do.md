

This is the todo list.  it holds items that i would like to get done.  assess if any of them are major - would require significant time or endanger current functionality.  label them as such and defer - ask if I want to work on them.  even for routine items, if there are design features that seem vague, ask for details and flesh out the details by default before you implement changes.  i may just jot something down and want to make it more complete.



Items in the "branch" section are likely to require a separate git branch - they have functionality that may break existing functionality or require iteration to get right.  Do not execute branch items automatically.  I will ask you to fix them when I have fleshed them out enough.





for other items, complete them and then move them in the file to the completed section with the timestamp (include the time of completion) and the commit identifier (if it is possible to get the identifier before committing.. if not, the timesetamp will do).  never commit to main.  remain on the same branch if NOT main, but checkout a new branch if on main.



I prefer that you follow TDD for major changes.  If an item is sufficient to require planning, then determine a test that runs red before the fix, then green, then refactor for speed, readability, modularity.  re-use tools and code as much as possible.





put specific change notes below the item that was touched so i know how it was handled.





### Priorities



This is a tool that is meant to be navigated without scrolling and with sequential depth when clicking.  You should be able to understand the big picture without a lot of coginitive weight.  The number of options exposed at once should be limited so as not to overwhelm.  keep a simple, uncluttered interface as much as possible.  actions should behave predictibly.  



the treesite is an alternative to normal websites.  it is built on D3 treemap technology and embraces the idea that we can hold about 3-10 things in our brains at once.  Once the context gets too big, we have a hard time.  This is about getting to the location/information you want by making comparisons of a limited basked of choices and then moving on to the next choice.  





### items



(all studio to_do items from this batch are done — see Completed below.)



### major







### branch









### Completed



section tiles still have the title overlay.  it should be gone.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- Removed `ParentMapHeaderOverlay` rendering from `handler/src/TreeSite.jsx`; section identity stays on in-tile `MinimalTile` text.



hide the right side ribbon - ribbon is currently not attached to any actions



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- Removed decorative rail from `studio/src/components/AppShell.jsx`; grid is 3 columns in `studio/src/studio.css`.



add langsmith api credentials to project - the root .env has key and project name



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- `load_repo_dotenv()` in `editor/treesite_editor/config.py` loads repo-root `.env` into `os.environ`; documented in `editor/README.md`.



on mini-map: change direct navigation behavior with options.  create optional preferences/settings for mini-map behavior:

Current approach can be "click-jump".

New behavior: add "go" arrow at the bottom right of mini-map to navigate main map to selected mini-map card.  Click on mini-map to navigate.   Mini-map navigation should behave like treemap.  this way the user can see the layout and labels without navigating directly to them.  the Star in the top left is always available to go home.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- Extended `shared/treesite-map/index.jsx` with `explore` vs `click-jump`, drill subtree, Go button, star/home reset.

- Studio prefs in `studio/src/components/MiniMap.jsx`; handler adapter in `handler/src/TreeSite.jsx`; shared `minimap-prefs.js` + tests in `tools/node/tests/minimap-behavior.test.js`.



on mini-map:

display option: on hover name of section or card should be displayed below the mini-map.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- Caption row under map; `labelMode` hover | select | off via same prefs UI in studio mini-map.



in the studio, I should be able to see the text description on a page.  title and text should be centered on the card.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- `studio/src/components/TreemapWorkspace.jsx` centers title + description on cells.



for html/website cards, there should be an option to capture the front page of the item and make it the front of the card.  don't make it a blocker, but the option is nice.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- Checkbox in `AddAssetDialog` (default on); `skipPreview` honored in `add-website.js` / `add-html.js` and API client.



there should be a button to launch a new project.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- `tools/node/create-artifact.js`, `POST /api/artifacts/create`, Top bar "New Project" in `App.jsx` / `TopCommandBar.jsx`.



project should start off with a full page landing page.  click anywhere to enter.



Completed: 2026-06-22 09:48  Commit: 0db0920



Change notes:

- New artifacts include `entryGate: true` welcome text item; `handler/src/EntryGate.jsx` full-viewport gate until session dismiss.



add click and navigation traces - viewable, playable logs



front end siezing on deploy -> edit artifact mode



mini-map: first click on section goes to parent, then children revealed.  maybe it needs a "go" button so that you can explore in some detail without instantly navigating.  you can go as deep as you like, then back out.  maybe "go" defaults to parent level... see what feels right.



need "home" golden path to start at the star, not the middle of the page.



labels should pop up on mini-map.  they could show up below the map as you click once - easy to cycle through sections.  maybe one click brings it into focus with name, second click opens it up.



changes to the mini-map should apply to both the deployed website and within the studio.



for cards, get rid of the labels with shading... seems kind of lame.  embed the names and description into the card - centered, as text.  html/image should be able to be chosen to show on map... rather than showing the cards below.  more like a typical header on a website.  The "front" of the card should be essentially a child of that section.  If its the only card in the section, then when you open the section, it pops up and takes all the space.  If not, it is the first section.  I guess I could have it set so that wehn the section is expanded, that card is selected, then click again to see sections... but how do you know there are sections.  



on editor, make the top ribbon smaller, so there is more room for editing.





adding child card under "selected text-card" added card under content types card, not under text card





when adding a card, the area is really too small... maybe a pop up to let more room.



should fill in href options as dropdown.  otherwise don't know where they would be... or can i use the nav panel on left





the add asset vs the add card - seems like a distinction that is not very clear.  would rather have add asset type pop up interface... and to be able to select which section something goes under... better interface.  





when adding a pdf got this error: Tool add-pdf produced no stdout. stderr: (node:10004) [DEP0040] DeprecationWarning: Module type of file:///C:/Users/doste/projects/treesite/tools/node/add-pdf.js is not specified and it doesn't parse as CommonJS. Reparsing as ES mo



similar when adding a website.  that tooling is not solid



Tool add-html produced no stdout. stderr: (node:12384) [DEP0040] DeprecationWarning: Module type of file:///C:/Users/doste/projects/treesite/tools/node/add-html.js is not specified and it doesn't parse as CommonJS. Reparsing as ES m



so adding assets is not right.



do i really need the "rename" button.  i can just change it directly.



Move works, but it should NOT be a pop up that blanks the screen because you can't use the navigation panel.  



where do hidden cards live?  they need to be viewable in navigation panel.



"See artifacts" button doesn't do anything - should open up file system.



"export artifact" works just fine - as long as its not timed out by another process.



getting a "timed out" warning when I press top ribbon buttons.



import artifact seemed to work just fine when I re-imported the "example.zip"



seems to be an issue going from deploy view to edit view.



small thing: the "stop deploy" button is white lettering on light background... can't read it.  needs darker background.

