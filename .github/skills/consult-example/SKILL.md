---
name: consult-example
description: A skill to routinely consult the codebase of the project 'GaussianBeam', a working C++ based library for Gaussian beam propagation and modematching. The skill should be used to consult specific parts of the project to ensure that the physics is conforming to the standard definitions and conventions used in the field of Gaussian beam optics, and that core functionality is similar. 
user-invocable: true
---

# Consult GaussianBeam Codebase
This skill is designed to consult the codebase of the 'GaussianBeam' project, a C++ library for Gaussian beam propagation and mode-matching. The skill should be used to verify that the physics implemented in the code conforms to standard definitions and conventions in Gaussian beam optics, and that core functionality is similar to what is expected in the field. It can also be used to guide decision making when implementing new features or modifying existing code, ensuring consistency with the established codebase and physics principles.

## When to use
- If the user requests to consult or consider the example codebase during the implementation or revision of new features related to Gaussian beam propagation, mode-matching, or resonator analysis. This includes statements like "see how GaussianBeam handles mode-matching calculations" or "consult the GaussianBeam codebase for how to calculate the eigenmode solution of a resonator".
- When developing new functionality, as a 'sanity test' to ensure that the implementation is consistent with existing code and physics principles. The functionality need not be (and in fact, should not be) identical to the consulted code, but should be consistent with the physics principles and conventions used in the codebase. It is a guideline and an example of a well-known and working Gaussian beam library, not to be copied or replicated.

## Use Cases
- When implementing new features related to Gaussian beam propagation, mode-matching, or resonator analysis, consult the codebase to ensure that the implementation is consistent with existing functionality and physics principles.
- When modifying existing code, consult the codebase to understand the current implementation and ensure that changes do not introduce inconsistencies or errors in the physics.
- When verifying the correctness of calculations related to Gaussian beam parameters, consult the codebase to compare against existing implementations and ensure that the results are consistent with standard definitions and conventions in Gaussian beam optics.
- When performing mode-matching calculations for coupling between beams and resonators, consult the codebase to ensure that the mode overlap integrals and eigenmode solutions are implemented correctly and consistent with established methods in the field.

## Consultation Guidelines
- The codebase exists in the project folder '\EXAMPLE' and is segmented into two directories: 'src' for 'under the hood' source code used to calculate optical beam properties, and 'gui' for elements of the user interface
- Specific, relevant files have been picked out of the codebase, and thus the included example project is not necessarily self-complete. The skill should be used to consult the specific files that are included in the project, and not to attempt to consult the entire codebase. It is expected that some files may attempt to reference other files that are not included in the project.

## Consulting Cavity Equations and Functionality
- '\EXAMPLE\src\Cavity.cpp' and '\EXAMPLE\src\Cavity.h' contain the implementation of the 'Cavity' class, which includes methods for calculating the eigenmode solution of an optical resonator and performing mode overlap integrals for Gaussian beams in resonators. When consulting these files, focus on understanding how the eigenmode solutions are calculated, how the mode overlap integrals are implemented, and how the results are used for mode-matching calculations. Pay attention to the mathematical formulations and numerical methods used in these implementations, and compare them against standard methods in the field of Gaussian beam optics to ensure consistency and correctness.

## Consulting ABCD Matrix Calculations
- '\EXAMPLE\src\GaussianBeam.cpp' and '\EXAMPLE\src\GaussianBeam.h' contain implementation of definitions, classes, and functions related to the properties of Gaussian beams
- '\EXAMPLE\src\Optics.cpp' and '\EXAMPLE\src\Optics.h' contain implementation of definitions, classes, and functions related to optical components and a reference of their ABCD matrix values.
- '\EXAMPLE\src\OpticsBench.cpp' and '\EXAMPLE\src\OpticsBench.h' contain implementation of definitions, classes, and functions related to the overall optical system and the calculation of the overall ABCD matrix for a sequence of components.
When consulting these files, focus on understanding how the ABCD matrices for different optical components are defined and calculated, and how they are used to propagate Gaussian beams through optical systems. Pay attention to the mathematical formulations of the ABCD matrices for free space propagation, lenses, mirrors, and interfaces between media with different refractive indices. Compare the implementations against standard definitions and conventions in Gaussian beam optics to ensure consistency and correctness. Additionally, review how the overall ABCD matrix for a sequence of components is calculated by multiplying the individual matrices in the correct order of propagation.
