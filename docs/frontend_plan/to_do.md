items to work on

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


when adding a pdf got this error: Tool add-pdf produced no stdout. stderr: (node:10004) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///C:/Users/doste/projects/treesite/tools/node/add-pdf.js is not specified and it doesn't parse as CommonJS. Reparsing as ES mo


similar when adding a website.  that tooling is not solid

Tool add-html produced no stdout. stderr: (node:12384) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///C:/Users/doste/projects/treesite/tools/node/add-html.js is not specified and it doesn't parse as CommonJS. Reparsing as ES m

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