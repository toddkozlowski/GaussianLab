---
name: optics-math
description: 'Set of strict physics-based mathematical rules and conventions for optics and Gaussian beam propagation used in this project. Use for calculating propagation of a Gaussian beam through an optical system using ABCD matrices to determine properties of the output beam such as waist size, waist position, wavefront curvature, complex q-parameter, and Gouy phase. Use also for calculating the geometric stability of optical resonators. 
user-invocable: true
---

# Optics Math
This is the skill which maintains strict, physics-based mathematical rules and conventions for optics and Gaussian beam propagation used in this project. It forms the basis of the 'Layer 0' Math kernel (no UI, pure functions, fully testable in isolation). It should be used to generate:
- ABCD matrix library for optical components and systems which are then used by higher layers to calculate the beam properties / state and to generate visualizations of the beam profile and Gouy phase.
- Calculations of Gaussian beam propagation through optical systems using the ABCD matrix formalism.
- Core calculations of resonator stability and eigenmode solution of resonators based on mirror curvatures and separation.
- Mode overlap integrals for Gaussian beams in resonators and mode-matching calculations for coupling between beams and resonators.


## What This Skill Produces
- Consistent and unambiguous ABCD matrices for optical systems.
- Clear and convention-consistent calculations of Gaussian beam propagation through optical systems.
- Reliable determination of resonator stability and beam parameters within resonators.

## When to Use
- When calculating the propagation of a Gaussian beam through an optical system using ABCD matrices.
- When determining the geometric stability of an optical resonator based on mirror curvatures and separation
- When calculating the eigenmode solution of an optical resonator.
- When performing mode overlap integrals for Gaussian beams in resonators and mode-matching calculations for coupling between beams and resonators.

## Physical Considerations
- All beams are to be considered as laser beams in the form of fundamental Gaussian modes.
- All beams are assumed to be monochromatic with a single wavelength lambda.
- All beams possess a defined waist size w0 at a position z0 along the propagation axis.
- The medium of the 'free space' between components should be assumed to be air (n=1).
- Treat lenses as thin elements with negligible thickness unless otherwise specified, and use the thin lens approximation for their ABCD matrices.

## Focal Length Sign Convention
- Focal length is positive when the focal point is 'downstream' of the element along the +z axis.
- Converging element: positive focal length (f > 0)
- Diverging element: negative focal length (f < 0)

## Radius of Curvature Sign Convention
- Radius is positive when the center of curvature lies at +z from the surface vertex.
- For a surface with vertex at z=0, if the center of curvature is at z > 0, then R > 0; if the center of curvature is at z < 0, then R < 0.

## Precision and Units Convention
- All values of length should be interpretted and calculated in meters, but should be reported as appropriate for the scale of the problem (for example, millimeters for typical laboratory focal lengths or mirror diameters, microns for sub-millimeter beam waists, meters for long propagation distances).
- All values should be interpretted and reported with sufficient precision to capture the relevant significant figures for the problem at hand, but should not be reported with excessive precision that implies a false level of accuracy. For example, a focal length of 100 mm should be reported as 100 mm, not 100.000 mm, unless the context requires that level of precision.
- Physical constants should be used with the following standard values to at least 8 significant figures when needed for calculations:
-- Speed of light c = 299792458 m/s
-- pi = 3.14159265

## Beam Radius Definition
- The beam radius w(z) is defined as the distance from the beam center to the point where the intensity falls to 1/e^2 of its maximum value. This is equivalent to the field amplitude falling to 1/e of its maximum value. 

## Full Width at Half Maximum (FWHM) Definition
- The Full Width at Half Maximum (FWHM) of the intensity profile of a Gaussian beam is defined as the distance between the two points on either side of the beam center where the intensity falls to half of its maximum value. For a Gaussian beam, FWHM is related to the beam radius w(z) by FWHM = w(z) * sqrt(2*ln(2)).

## Gaussian Beam Definitions and Conventions
- The Rayleigh range z_R is defined as z_R = pi * w0^2 * n / lambda where n is the refractive index of the medium (n=1 for air). Assume n=1 unless otherwise specified.
- The beam radius w(z) evolves as it propagates in the longitudinal z direction according to w(z) = w0 * sqrt(1 + ((z - z0)/z_R)^2)
- The radius of the beam w(z) at any positions z along the beam is related to the Full Width at Half Maximum (FWHM) of the intensity profile by FWHM = w(z) * sqrt(2*ln(2)).
- The beam wavefront curvature R(z) evolves as R(z) = (z - z0) * (1 + (z_R/(z - z0))^2)
- The beam divergence angle theta is defined as theta = lambda / (pi * w0) for a Gaussian beam in the far field (z >> z_R).

## Complex Beam Parameter Equations
- The complex beam parameter q is defined as 1/q = 1/R - i * lambda/(pi * w^2), where R is the wavefront radius of curvature, w is the beam waist size, and lambda is the wavelength.
- The q-parameter can alternatively be expressed as q = z + i*z_R, where z is the distance from the beam waist and z_R is the Rayleigh range.
- The q-parameter transforms under ABCD propagation as q_out = (A*q_in + B) / (C*q_in + D).
- The inverse of the q-parameter, 1/q, has units of inverse length and encodes both curvature and beam size information. Inverse q-parameter is often more convenient for calculations involving Gaussian beam propagation.
- Inverse q-parameter transforms under ABCD propagation as 1/q_out = (C + D/q_in) / (A + B/q_in).
- In free space propagation over a distance L, the q-parameter evolves as q(z) = q0 + L, where q0 is the initial q-parameter at the starting position.

## Optical Resonator Equations
- The geometric stability of an optical resonator can be determined by the two mirror radii of curvature and their separation, L, using the g-parameters defined as g1 = 1 - L/R1 and g2 = 1 - L/R2, where R1 and R2 are the radii of curvature of the two mirrors. The resonator is stable if 0 <= g1*g2 <= 1. The product g1 * g2 is the geometric stability parameter.
- The round-trip ABCD matrix for a two-mirror resonator can be constructed by multiplying the matrices for free space propagation and mirror reflections in the correct order. The stability condition can also be expressed in terms of the round-trip ABCD matrix elements as 0 <= ((A + D)/2)^2 <= 1, where A and D are the diagonal elements of the round-trip matrix.
- The complex q-parameter of the beam inside the resonator can be found by solving the self-consistency condition q = (A * q + B) / (C * q + D) for the round-trip ABCD matrix, which leads to a quadratic equation in q: C * q^2 + (D - A)*q - B = 0.

## ABCD Matrix Conventions
- Free space propagation over a distance L: M = [[1, L], [0, 1]]
- Thin lens with focal length f: M = [[1, 0], [-1/f, 1]]
- Reflection from a mirror with radius of curvature R: M = [[1, 0], [2/R, 1]]
- Interface between media with refractive indices n1 and n2: M = [[1, 0], [(n1 - n2)/(n1 * n2), 1]]
- For a sequence of components, the overall ABCD matrix is obtained by multiplying the individual matrices in the order of propagation (right to left). For example, for a system with components A, B, C in that order, the overall matrix is M_total = M_C * M_B * M_A.

## Beam Propagation Steps
1. The properties of the Gaussian beam is calculated at each position along the direction of propagation using the ABCD matrix formalism. The input beam parameters (waist size w0, waist position z0, wavelength lambda) are used to calculate the initial q-parameter q0 at the starting position.
2. For each optical component in the system, the corresponding ABCD matrix is determined based on the type of component and its parameters (e.g., focal length for lenses, radius of curvature for mirrors).
3. The beam properties at each position are calculated by multiplies ABCD matrices in the correct order to find the overall ABCD matrix for the system up to that point, including free space propagation between components and the free space propagation after the last component to the observation plane if needed.
4. The output q-parameter at each position is calculated using the ABCD transformation of the q-parameter, and from the q-parameter, the beam waist size w(z), wavefront curvature R(z), and Gouy phase can be calculated using the standard Gaussian beam equations.

## Eigenmode Overlap and Mode-Matching Calculations
- The mode overlap integral between two Gaussian modes with waist sizes w1 and w2 and waist positions z1 and z2 can be calculated using the formula: O = (2 * sqrt(w1 * w2) / (w1 + w2)) * exp(-pi * (z1 - z2)^2 / (lambda * (w1 + w2))). This approximation assumes that the modes are well-aligned and that the beam waists are not too different in size. For more general cases, the overlap integral can be calculated by integrating the product of the two mode field distributions over the transverse plane.

## Example Invocations
- /optics-math Derive the ABCD matrix for free space L1, thin lens f, free space L2 and solve image plane condition.
- /optics-math Use my sign convention: real-is-positive. Compute principal planes and effective focal length for a thick lens approximation.
- /optics-math Propagate Gaussian beam q through lens-plus-drift system and report waist location and size.
