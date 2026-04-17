---
name: first-iteration-fixes
description: This prompt is used to make corrections and revisions to the project based on feedback after the first manual review and test. The points in this prompt will describe and contrast the current behaviour of this iteration, and the desired end behaviour. 
model: Auto (copilot)
tools: [agent, edit, todo, search, read, web, execute, agent]
---

# First iteration fixes
You are a software engineer who will accept a list of user reports about current undesired behavior, and a description of how the feature or element should behave instead. Generate a point-by-point plan to implement the necessary changes to the project in order to make sure no issues are skipped over or ignored. The feedback will be structured with a descriptive title, a description of the current behavior, and a description of the desired behavior.

It is important to note that the absence of an issue related to a feature does not mean the feature is working correctly - some features have not, or were not able to be tested.

Make any changes to the project that are necessary to implement the desired behavior, and make sure to test the changes to confirm that the issues have been resolved. If any of the issues require clarification, or if there are any assumptions that need to be confirmed, ask for clarification before proceeding with the implementation. Maintain consistency with the design philosophy previously used, including generous testing, thoughtful segregation of the layers or kernels of logic and complexity (ie to allow modification on the UI level without touching core physics code, and vice versa), and careful documentation of the code and the decisions made.

## Issue 1: UI scale / size / scrollbar
### Current behavior:
The webpage currently includes a scrollbar, even when on fullscreen on a decently sized (1080p) monitor. The scrollbar is for the entire webpage
### Desired behavior:
The page should usually all fit on a single, scroll-less page at reasonable resolutions, with scrollbars only for the individual elements as necessary. The webpage should be designed to be responsive and adapt to different screen sizes without requiring the user to scroll horizontally or vertically to access the main content.

## Issue 2: Optical table display
### Current behavior:
The canvas is occupied by a grid which spans the entire canvas area.
### Desired behavior:
Draw the outline of the optical table, based on the dimensions, which occupied most but not all of the canvas. The scale of the canvas UI element should be independent of that of the optical table. As an extreme example, a miniature table only 10mm to a side would appear as a tiny square in the canvas, and an extremely large optical table should not have most of it visible. Position the table within the canvas by default so that the top-left corner of the optical table is near *but not directly at* the top-left corner of the canvas, leaving some margin.

## Issue 3: Component interactivity
### Current behavior:
Components can be dragged and dropped onto the canvas, but they do not snap to a grid or have any constraints on their placement. Furthermore, there is no way to select or rotate components once they are placed on the canvas.
### Desired behavior:
Components should be interactable directly on the canvas, with the following features:
- selecting a component will 'highlight' it visually to indicate that it is selected
- options associated with the component are then displayed directly over the canvas. For now, this should just be a 'rotate by 90' option which rotates the component in increments of 90 degrees, with a small rotation symbol to visually indicate this. 
- 'light source' components should also have the ability to modify their initial mode (waist position, waist size) and wavelength when selected, in a three-field panel which appears over/next to the selected light source and is populated with the current (or default) values
- in a side panel, all of the properties of the component (focal length, dimensions, x and y position, beam size at the component, etc.) should be displayed and editable when the component is selected. This is in addition to the over-canvas options, which are for quick adjustments, while the side panel allows for more detailed control and visibility of all properties.

## Issue 4: Snapping to grid
### Current behavior:
Components do not snap to any grid when being dragged and dropped onto the canvas, allowing for arbitrary placement, despite the presence of a grid in the background and a statement 'Grid snapping enabled' in the UI just below the canvas title.
### Desired behavior:
Components should snap to a grid when being dragged and dropped onto the canvas. The grid spacing should be defined in the state schema, and the snapping behavior should be implemented in the component placement logic. When a component is dragged near a grid point, it should automatically snap to that point, making it easier for users to align components on the optical table.

## Issue 5: Mirror reflection direction
### Current behavior:
When a beam encounters a mirror, the reflection is inverted to the apparent direction of the mirror. For example, the graphic of the mirror appears to be oriented -45 degrees with respect to the vertical axis, but reflects a beam incoming from the right upwards, as if the mirror were oriented at +45 degrees. as there is no current way to test the rotation (see Issue 3), the inverse situation cannot be tested.
### Desired behavior:
The reflection direction of the mirror should match its apparent orientation. For example, a mirror that appears to be oriented at -45 degrees should reflect a beam incoming from the right downwards, while a mirror that appears to be oriented at +45 degrees should reflect a beam incoming from the right upwards. This will ensure that the behavior of the mirrors is intuitive and consistent with their visual representation on the canvas.

## Issue 6: Beam profile evolution (CRITICAL)
### Current behavior:
The beam profile evolution is accurately calculated and displayed both on the 1D profile window and on the table in the following way: introducing an optical element seems to affect the beam properties and profile both after *and before* the element is introduced. For example, placing a lens on the table will change the profile of the beam between the source and the lens. This is HIGH PRIORITY to fix and a possible issue with core physics understanding. Optical elements which are encountered by the propagating beam should only affect the beam properties and profile after the point of encounter, not before, effectly creating a 'new' beam which has mode properties of the previous beam multiplied by the ABCD matrix of the element, but only after the point of encounter. This is critical to get right, and a thorough understanding of how this went wrong is needed. Furthermore the behaviour looks fundamentally wrong - a lens, for example, causes a massive and instant change in the beam profile at the position of the lens, a non-physical step-like function.
### Desired behavior:
The beam profile evolution should be calculated and displayed such that optical elements only affect the beam properties and profile after the point of encounter. For example, placing a lens on the table should only change the profile of the beam after the lens, while the profile of the beam between the source and the lens should remain unaffected. This will ensure that the beam propagation is accurately represented and that users can correctly understand how optical elements influence the beam as it propagates through the system.

## Issue 7: Canvas display
### Current behavior:
The window/UI block element assigned to the canvas for the optical table extends beyond the grided region. It is unclear if this suggests the grid region is the optical table. Objects which are dragged outside the grided region disappear (but are not deleted!). No elements should be allowed to be made invisible or placed off the table. Placement off the table should be prevented by a hard boundary, and the canvas should be designed to visually indicate the boundaries of the optical table more clearly.
### Desired behavior:
The canvas should be designed to visually indicate the boundaries of the optical table more clearly, and the window/UI block element assigned to the canvas should not extend beyond the grided region. Objects should not be allowed to be dragged outside the boundaries of the optical table, and any attempt to do so should be prevented by a hard boundary. This will ensure that users can easily understand the limits of the optical table and prevent confusion about where components can be placed.

## Issue 8: Optical table visual depiction
### Current behavior:
There is a simple grid representing the gridded nature of the optical table, but there is no clear visual indication of the boundaries of the optical table itself. This can lead to confusion about where components can be placed and where the beam can propagate. 
### Desired behavior:
The optical table should be visually depicted in a way that clearly indicates its boundaries. This could be achieved by drawing a distinct outline around the optical table, using a different background color for the area outside the table, or adding a visual element such as a border or shading to differentiate the table from the surrounding canvas. This will help users understand where components can be placed and where the beam can propagate, improving the overall usability of the application. Additionally, place a small dot or circle at each grid intersection point to represent the typical M4 screw fixation points on a standard optical table.

## Issue 9: Initial placement of components
### Current behavior:
Components cannot be dragged onto the table, only added via a "Add flat mirror" or "Add thin lens" button, which initially places them at the bottom-center of the canvas, regardless of the dimensions of the optical table or the position of the source. This can lead to components being placed in unintuitive locations and may require additional dragging to move them to the desired location on the table.
### Desired behavior:
Components should be able to be dragged and dropped directly onto the optical table from a component palette. When a component is added to the table, it should initially be placed at the location where it was dropped, rather than a fixed position. This will allow users to more intuitively place components on the table and reduce the need for additional dragging to move them to the desired location. Additionally, when a component is added via a button (e.g., "Add flat mirror"), it should be placed at a default location that is near the center of the optical table, rather than the bottom-center of the canvas, to make it easier for users to find and interact with the newly added component.