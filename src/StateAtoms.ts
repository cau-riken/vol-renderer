import { atom } from 'jotai'

import * as THREE from 'three';

export type LoadedVolumeFile = {
    fileOrBlob: File | Blob | undefined,
    name: string,
};

export enum ViewMode {
    None = 'none',
    Volume3D = 'Volume3D',
    Slice3D = 'Slices3D',
    Slice2D = 'Slices2D',
}

export enum BrainModelMode {
    Volume,
    Clipped,
}

export enum PlaneIndex {
    X = 0,
    Y = 1,
    Z = 2,
}

export enum CameraPOV {
    Free,
    Left,
    Right,
    Anterior,
    Posterior,
    Superior,
    Inferior,
}

type Axe = { label: string, dir: THREE.Vector3 };
export const Axes: Axe[] = [];
{
    Axes[CameraPOV.Left] = { label: 'L', dir: new THREE.Vector3(-1, 0, 0) };
    Axes[CameraPOV.Right] = { label: 'R', dir: new THREE.Vector3(1, 0, 0) };
    Axes[CameraPOV.Posterior] = { label: 'P', dir: new THREE.Vector3(0, -1, 0) };
    Axes[CameraPOV.Anterior] = { label: 'A', dir: new THREE.Vector3(0, 1, 0) };
    Axes[CameraPOV.Inferior] = { label: 'I', dir: new THREE.Vector3(0, 0, -1) };
    Axes[CameraPOV.Superior] = { label: 'S', dir: new THREE.Vector3(0, 0, 1) };
}

interface CameraRotation extends Axe {
    up: THREE.Vector3;
    direct: CameraPOV[];
}

export const CameraRotations = new Map<CameraPOV, CameraRotation>();
{
    [
        {
            pov: CameraPOV.Left,
            up: new THREE.Vector3(0, 0, 1), direct: [CameraPOV.Posterior, CameraPOV.Anterior, CameraPOV.Superior,]
        },
        {
            pov: CameraPOV.Right,
            up: new THREE.Vector3(0, 0, 1), direct: [CameraPOV.Posterior, CameraPOV.Anterior, CameraPOV.Inferior,]
        },
        {
            pov: CameraPOV.Posterior,
            up: new THREE.Vector3(0, 0, 1), direct: [CameraPOV.Left, CameraPOV.Right, CameraPOV.Superior,]
        },
        {
            pov: CameraPOV.Anterior,
            up: new THREE.Vector3(0, 0, 1), direct: [CameraPOV.Left, CameraPOV.Right, CameraPOV.Inferior,]
        },
        {
            pov: CameraPOV.Inferior,
            up: new THREE.Vector3(0, 1, 0), direct: [CameraPOV.Right, CameraPOV.Anterior,]
        },
        {
            pov: CameraPOV.Superior,
            up: new THREE.Vector3(0, 1, 0), direct: [CameraPOV.Left, CameraPOV.Posterior,]
        },
    ].forEach(
        info => {
            const axis = Axes[info.pov];
            if (axis) {
                CameraRotations.set(info.pov, { ...info, ...axis })
            }
        }
    )
}

export const intermediatePositions = [
    { fromTo: [CameraPOV.Inferior, CameraPOV.Posterior], between: new THREE.Vector3(0.5, 0, 0) },
    { fromTo: [CameraPOV.Posterior, CameraPOV.Anterior], between: new THREE.Vector3(-0.5, 0, 0.5) },
    { fromTo: [CameraPOV.Anterior, CameraPOV.Superior], between: new THREE.Vector3(-0.5, 0, 0) },
    { fromTo: [CameraPOV.Superior, CameraPOV.Inferior], between: new THREE.Vector3(0.5, 0.5, 0) },
    { fromTo: [CameraPOV.Inferior, CameraPOV.Left], between: new THREE.Vector3(0, 0.5, -0.5) },
    { fromTo: [CameraPOV.Left, CameraPOV.Right], between: new THREE.Vector3(0, 0.5, 0.5) },
    { fromTo: [CameraPOV.Right, CameraPOV.Superior], between: new THREE.Vector3(0.5, -0.5, 0) },

];

export const volumeFile = atom<LoadedVolumeFile | undefined>(undefined);

export const isLoading = atom(false);
export const volumeLoaded = atom(false);

export const volumeValMin = atom(0.0);
export const volumeValMax = atom(1.0);

export const viewMode = atom(ViewMode.Slice3D);
export const alertMessage = atom<JSX.Element | undefined>(undefined);

export const deltaRotation = atom([0, 0, 0] as [number, number, number]);
export const cameraRotation = atom({ up: [0, 0, 0], position: [0, 0, 0] });
export const cameraPOV = atom(CameraPOV.Free);

export const isothreshold = atom(0.5);
export const clims = atom([0, 1]);
export const castIso = atom(true);

export const showXSlice = atom(false);
export const showYSlice = atom(false);
export const showZSlice = atom(true);
export const volumeRange = atom([0, 0] as [number, number]);
export const volumeMixRatio = atom(1);

export const indexX = atom(0);
export const indexY = atom(0);
export const indexZ = atom(0);

export const maxIndexX = atom(0);
export const maxIndexY = atom(0);
export const maxIndexZ = atom(0);
