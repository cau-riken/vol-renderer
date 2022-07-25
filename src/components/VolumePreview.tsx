import React from "react";
import { useAtom } from "jotai";


import {
    AnimationAction,
    AnimationClip,
    AnimationMixer,
    BackSide,
    BooleanKeyframeTrack,
    Box3,
    BoxGeometry,
    BoxHelper,
    BufferGeometry,
    Camera,
    Clock,
    DataTexture3D,
    EdgesGeometry,
    EventDispatcher,
    FloatType,
    Group,
    HemisphereLight,
    LinearFilter,
    LineBasicMaterial,
    LineSegments,
    LoadingManager,
    LoopOnce,
    Material,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    PerspectiveCamera,
    Raycaster,
    RedFormat,
    Renderer,
    Scene,
    ShaderMaterial,
    Texture,
    TextureLoader,
    UniformsUtils,
    Vector2,
    Vector3,
    WebGLRenderer,
} from 'three';
import TWEEN from '@tweenjs/tween.js';

import Stats from 'three/examples/jsm/libs/stats.module.js';

import { VolumeRenderShader1 } from 'three/examples/jsm/shaders/VolumeShader.js';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';
import { DragControls } from 'three/examples/jsm/controls/DragControls';

import { NIfTILoader } from '../loaders/NIfTILoader';

import {
    Alert,
    Spinner,
    SpinnerSize,
    ResizeEntry,
    Icon,
} from "@blueprintjs/core";

import {
    ResizeSensor2,
} from "@blueprintjs/popover2";

import * as StAtm from '../StateAtoms';


import "./VolumePreview.scss";

import viridis_b64 from './cm_viridis.png';


import { getNormPointer, setupAxesHelper } from './Utils';
import { AxisIndex, IndexedRegionColorEntry, Volume } from "../misc/Volume";
import { VolumeSlice } from "../misc/VolumeSlice";
import PreviewControls from "./PreviewControls";


const Init_PerspCam_FOV = 50;

type ListenerInfo = {
    event: string,
    listener: any,
    dispatcher: EventDispatcher,
}

const setupInset = (insetAspect: number, camera: Camera) => {
    // scene
    const insetScene = new Scene();

    // camera
    const insetCamera = new PerspectiveCamera(50, insetAspect, 1, 1000);
    insetCamera.name = 'inset-cam';
    insetCamera.up = camera.up; // important!

    // axes
    setupAxesHelper(100, insetScene)

    return { insetScene, insetCamera };
}

//references of ThreeJS objects not created by React
export type Obj3dRefs = {

    stats?: Stats | undefined,

    //main scene (volume 3D & slices in 3D)
    renderer?: WebGLRenderer | undefined,
    activeCam?: Camera | undefined,
    orthCam?: OrthographicCamera | undefined,
    perspCam?: PerspectiveCamera | undefined,

    scene?: Scene | undefined,
    controls?: ArcballControls | undefined,

    //insets related  
    renderer2?: Renderer | undefined,
    aspect2?: number,
    camera2?: PerspectiveCamera | undefined,
    scene2?: Scene | undefined,

    //for slices rendering
    volume?: Volume | undefined,
    sliceX?: VolumeSlice | undefined,
    sliceY?: VolumeSlice | undefined,
    sliceZ?: VolumeSlice | undefined,

    //for volume rendering
    vol3D?: Group | undefined,
    materialVol3D?: ShaderMaterial | undefined,

    //brain model
    brainModel?: Group | undefined,
    //materials for brain model
    brModelPlainMats?: Material[] | undefined,

    //groups for user created landmarks
    marksGroup?: Group | undefined,

    //volume bounding box 
    cube?: Mesh | undefined,

    boxAniMixer?: AnimationMixer | undefined,
    boxAninAction?: AnimationAction | undefined,

    //standard planes scenes (slices in 2D)
    rendX?: WebGLRenderer | undefined,
    camX?: OrthographicCamera | undefined,
    sliceXCtrl?: ArcballControls | undefined,
    dragCtrlX?: DragControls | undefined,

    rendY?: WebGLRenderer | undefined,
    camY?: OrthographicCamera | undefined,
    sliceYCtrl?: ArcballControls | undefined,
    dragCtrlY?: DragControls | undefined,

    rendZ?: WebGLRenderer | undefined,
    camZ?: OrthographicCamera | undefined,
    sliceZCtrl?: ArcballControls | undefined,
    dragCtrlZ?: DragControls | undefined,


    //others ThreeJS objects which need to be released when undloading volume 
    disposable: (BufferGeometry | Material | Texture)[],

    listeners: ListenerInfo[],

};


//Part of the state used within ThreeJs listeners. 
//Note: Because ThreeJs is updated more frequently than React, the state managed by the latter might 
//      not be up-to-date when needed by ThreeJs; 
//      Hence part of the state is also handled as regular instance variable.
export type RealTimeState = {
    camDistance?: number,
    viewMode?: StAtm.ViewMode,
    normPointer: Vector2,
    indexX?: number,
    indexY?: number,
    indexZ?: number,
};


const SELECTED_FILE_FAKEURL = "selected_file";

type VolumePreviewProps = {
    inlineControls?: boolean,
};

export const VolumePreview = (props: VolumePreviewProps) => {

    const [viewMode, setViewMode] = useAtom(StAtm.viewMode);

    const [isLoading, setIsLoading] = useAtom(StAtm.isLoading);
    const [volumeFile,] = useAtom(StAtm.volumeFile);
    const [volumeLoaded, setVolumeLoaded] = useAtom(StAtm.volumeLoaded);

    const [alertMessage, setAlertMessage] = useAtom(StAtm.alertMessage);

    const [cameraPOV, setCameraPOV] = useAtom(StAtm.cameraPOV);

    const [isothreshold, setIsothreshold] = useAtom(StAtm.isothreshold);
    const [clims, setClims] = useAtom(StAtm.clims);
    const [castIso, setCastIso] = useAtom(StAtm.castIso);

    const [showXSlice, setShowXSlice] = useAtom(StAtm.showXSlice);
    const [showYSlice, setShowYSlice] = useAtom(StAtm.showYSlice);
    const [showZSlice, setShowZSlice] = useAtom(StAtm.showZSlice);

    const [volumeRange, setVolumeRange] = useAtom(StAtm.volumeRange);
    const [volumeMixRatio, setVolumeMixRatio] = useAtom(StAtm.volumeMixRatio);
    const [, setVolumeValMin] = useAtom(StAtm.volumeValMin);
    const [, setVolumeValMax] = useAtom(StAtm.volumeValMax);

    const [indexX, setIndexX] = useAtom(StAtm.indexX);
    const [indexY, setIndexY] = useAtom(StAtm.indexY);
    const [indexZ, setIndexZ] = useAtom(StAtm.indexZ);

    const [, setMaxIndexX] = useAtom(StAtm.maxIndexX);
    const [, setMaxIndexY] = useAtom(StAtm.maxIndexY);
    const [, setMaxIndexZ] = useAtom(StAtm.maxIndexZ);

    const [animateTransition, setAnimateTransition] = React.useState(false);
    const [sliceRendPosIndices, setSliceRendPosIndices] = React.useState([2, 0, 1]);

    const [mriBoxMinMax, setMRIBoxMinMax] = React.useState({ min: [0, 0, 0], max: [0, 0, 0] });

    const [focusedRegion, setFocusedRegion] = React.useState<IndexedRegionColorEntry | undefined>();

    const volRendererContainer = React.useRef<HTMLDivElement>(null);
    const clock = React.useRef(new Clock());

    const objectURLs = React.useRef<string[]>([]);
    const volRendererInset = React.useRef<HTMLDivElement>(null);

    const sliceXRendererContainer = React.useRef<HTMLDivElement>(null);
    const sliceYRendererContainer = React.useRef<HTMLDivElement>(null);
    const sliceZRendererContainer = React.useRef<HTMLDivElement>(null);

    const sliceRendPlaceholder1 = React.useRef<HTMLDivElement>(null);
    const sliceRendPlaceholder2 = React.useRef<HTMLDivElement>(null);
    const sliceRendPlaceholder3 = React.useRef<HTMLDivElement>(null);


    const obj3d = React.useRef<Obj3dRefs>({
        disposable: [],
        listeners: []
    });



    const rtState = React.useRef<RealTimeState>({
        normPointer: new Vector2()
    });

    React.useEffect(() => {

        rtState.current = {
            ...rtState.current,
            viewMode,
            indexX,
            indexY,
            indexZ,
        };
        renderAll();

    });

    React.useEffect(() => {

        //set active camera appropriate to current view mode
        if (StAtm.ViewMode.Slice3D === viewMode) {
            if (obj3d.current.activeCam != obj3d.current.perspCam) {
                obj3d.current.activeCam = obj3d.current.perspCam;
            }
        } else {
            if (obj3d.current.activeCam != obj3d.current.orthCam) {
                obj3d.current.activeCam = obj3d.current.orthCam;
            }
        }

        if (obj3d.current.vol3D) {

            if (StAtm.ViewMode.Volume3D === viewMode) {
                obj3d.current.vol3D.visible = true;

                obj3d.current.sliceX?.mesh && (obj3d.current.sliceX.mesh.visible = false);
                obj3d.current.sliceY?.mesh && (obj3d.current.sliceY.mesh.visible = false);
                obj3d.current.sliceZ?.mesh && (obj3d.current.sliceZ.mesh.visible = false);
            } else {
                obj3d.current.vol3D.visible = false;

                //slice object is visible to allow its children being visible,
                //slice material might be hidden though to hide the slice in Slice3D view.

                obj3d.current.sliceX?.mesh && (obj3d.current.sliceX.mesh.visible = true);
                obj3d.current.sliceY?.mesh && (obj3d.current.sliceY.mesh.visible = true);
                obj3d.current.sliceZ?.mesh && (obj3d.current.sliceZ.mesh.visible = true);
                obj3d.current.sliceX.mesh.material.visible = showXSlice;
                obj3d.current.sliceY.mesh.material.visible = showYSlice;
                obj3d.current.sliceZ.mesh.material.visible = showZSlice;
            }
        }

        //stop animation when rendering volume (as the shader becomes slow when the animation is processed)
        if (StAtm.ViewMode.Volume3D === viewMode && obj3d.current?.boxAninAction) {
            obj3d.current.boxAninAction.stop();
        }

        if (viewMode != StAtm.ViewMode.Slice2D) {


        } else {
            //show at least one slice
            if (!showXSlice && !showYSlice && !showZSlice) {
                setShowXSlice(true);
            }

            const sliceXRendCont = sliceXRendererContainer.current;
            if (sliceXRendCont && obj3d.current.rendX) {
                obj3d.current.rendX.setSize(sliceXRendCont.offsetWidth, sliceXRendCont.offsetHeight);
            }
            const sliceYRendCont = sliceYRendererContainer.current;
            if (sliceYRendCont && obj3d.current.rendY) {
                obj3d.current.rendY.setSize(sliceYRendCont.offsetWidth, sliceYRendCont.offsetHeight);
            }
            const sliceZRendCont = sliceZRendererContainer.current;
            if (sliceZRendCont && obj3d.current.rendZ) {
                obj3d.current.rendZ.setSize(sliceZRendCont.offsetWidth, sliceZRendCont.offsetHeight);
            }
        }

        handleResize();

    }, [viewMode]);


    const changeCameraPOV = (toPosition: Vector3, toUp: Vector3, withControlReset?: boolean) => {
        if (obj3d.current.activeCam && obj3d.current.controls) {
            withControlReset && obj3d.current.controls.reset();
            obj3d.current.activeCam.up.copy(toUp);
            obj3d.current.activeCam.position.copy(toPosition);
            obj3d.current.activeCam.lookAt(0, 0, 0);
            const inactiveCam = (obj3d.current.activeCam === obj3d.current.orthCam) ? obj3d.current.perspCam : obj3d.current.orthCam;
            if (inactiveCam) {
                inactiveCam.up.copy(toUp);
                inactiveCam.position.copy(toPosition);
                inactiveCam.lookAt(0, 0, 0);
            }

            setCameraPOV(StAtm.CameraPOV.Free);
        }
    }

    React.useEffect(() => {
        if (obj3d.current.activeCam && obj3d.current.controls && rtState.current.camDistance) {

            const cameraRotation = StAtm.CameraRotations.get(cameraPOV);
            if (cameraRotation) {
                const targetPosition = cameraRotation.dir.clone().multiplyScalar(rtState.current.camDistance);

                if (!animateTransition) {
                    changeCameraPOV(targetPosition, cameraRotation.up, true);

                } else {
                    //animated transition duration in ms
                    const duration = 600;

                    //find which fixed cameraPOV is closest to current camera position?
                    const currentNormPos = new Vector3().copy(obj3d.current.activeCam.position).divideScalar(rtState.current.camDistance);
                    const closest =
                        [...StAtm.CameraRotations.entries()]
                            .map(([pov, info]) => { return { pov, info, dist: currentNormPos.distanceTo(info.dir) }; })
                            .reduce(
                                (prev, curr) => {
                                    if (prev) {

                                        if (curr.dist < prev.dist) {
                                            return curr;
                                        }
                                    }
                                    return prev;
                                }
                            )


                    if (closest.pov === cameraPOV && closest.dist < 0.45) {
                        //not worth animating the transition
                        changeCameraPOV(targetPosition, cameraRotation.up, true);

                    } else {
                        let mainTween;

                        //Is itr possible to directly transit to target or is an intermediate step necessary?
                        if (closest.info.direct.includes(cameraPOV)) {

                            //transition can be done directly in a single step
                            mainTween =
                                new TWEEN.Tween(obj3d.current.activeCam.position)
                                    .to(targetPosition, duration)
                                    .onUpdate(target => {
                                        obj3d.current.activeCam && obj3d.current.activeCam.lookAt(0, 0, 0);
                                    })
                                    .onComplete(target => {
                                        obj3d.current.controls && (obj3d.current.controls.enabled = true);
                                        //ensure final position is reached
                                        changeCameraPOV(targetPosition, cameraRotation.up);
                                    });


                        } else {
                            //need to transit through an intermediary step if camera POV change would change one single coordinate, 
                            //(which won't show any gradual change since the camera is orthographic)

                            const intermediate = StAtm.intermediatePositions.find(ip => ip.fromTo.includes(closest.pov) && ip.fromTo.includes(cameraPOV));
                            const intermediatePos = intermediate
                                ?
                                intermediate.between.clone().multiplyScalar(rtState.current.camDistance)
                                :
                                new Vector3();

                            mainTween =
                                new TWEEN.Tween(obj3d.current.activeCam.position)
                                    .to(intermediatePos, duration / 2)
                                    .onUpdate(target => {
                                        obj3d.current.activeCam && obj3d.current.activeCam.lookAt(0, 0, 0);
                                    })
                                    .chain(
                                        new TWEEN.Tween(obj3d.current.activeCam.position)
                                            .to(targetPosition, duration / 2)
                                            .onUpdate(target => {
                                                obj3d.current.activeCam && obj3d.current.activeCam.lookAt(0, 0, 0);
                                            })
                                            .onComplete(target => {
                                                //restore controls
                                                obj3d.current.controls && (obj3d.current.controls.enabled = true);
                                                //ensure final position is reached
                                                changeCameraPOV(targetPosition, cameraRotation.up);
                                            })
                                    );
                        }

                        //animate camera up 
                        new TWEEN.Tween(obj3d.current.activeCam.up)
                            .to(cameraRotation.up, duration)
                            .easing(TWEEN.Easing.Quadratic.Out)
                            .start();

                        //animation loop iterates until last tween step
                        const animate = () => {
                            TWEEN.update() && requestAnimationFrame(animate);
                            renderAll();
                        }
                        //disable controls while animating transition
                        obj3d.current.controls.enabled = false;
                        mainTween.start();
                        //start animation loop
                        animate();
                    }
                }
            }
        }
    }, [cameraPOV]);



    React.useEffect(() => {

        if (obj3d.current.sliceX) {
            obj3d.current.sliceX.mesh.material.visible = showXSlice;
            if (viewMode === StAtm.ViewMode.Slice2D) {
                if (!showXSlice && !showYSlice && !showZSlice) {
                    setShowYSlice(true);
                }
                handleResize();
            }
            renderAll();
        }

    }, [showXSlice]);

    React.useEffect(() => {

        if (obj3d.current.sliceY) {
            obj3d.current.sliceY.mesh.material.visible = showYSlice;
            if (viewMode === StAtm.ViewMode.Slice2D) {
                if (!showXSlice && !showYSlice && !showZSlice) {
                    setShowZSlice(true);
                }
                handleResize();
            }
            renderAll();
        }

    }, [showYSlice]);

    React.useEffect(() => {

        if (obj3d.current.sliceZ) {
            obj3d.current.sliceZ.mesh.material.visible = showZSlice;
            if (viewMode === StAtm.ViewMode.Slice2D) {
                if (!showXSlice && !showYSlice && !showZSlice) {
                    setShowXSlice(true);
                }
                handleResize();
            }
            renderAll();
        }

    }, [showZSlice]);



    React.useEffect(() => {

        if (volumeLoaded && obj3d.current.sliceX) {
            obj3d.current.sliceX.index = indexX;
            obj3d.current.sliceX.repaint();

            renderAll();
        }

    }, [indexX]);


    React.useEffect(() => {

        if (volumeLoaded && obj3d.current.sliceY) {
            obj3d.current.sliceY.index = indexY;
            obj3d.current.sliceY.repaint();

            renderAll();
        }

    }, [indexY]);


    React.useEffect(() => {

        if (volumeLoaded && obj3d.current.sliceZ) {
            obj3d.current.sliceZ.index = indexZ;
            obj3d.current.sliceZ.repaint();

            renderAll();
        }

    }, [indexZ]);


    React.useEffect(() => {

        if (volumeLoaded && StAtm.ViewMode.Slice2D === viewMode) {
            handleResize();
        }

    }, [sliceRendPosIndices]);


    React.useEffect(() => {

        if (volumeLoaded && obj3d.current.volume) {
            obj3d.current.volume.windowLow = volumeRange[0];
            obj3d.current.volume.windowHigh = volumeRange[1];
            obj3d.current.volume.repaintAllSlices();
        }

    }, [volumeRange]);

    React.useEffect(() => {

        if (volumeLoaded && obj3d.current.volume) {
            obj3d.current.volume.mixRatio = volumeMixRatio;
            obj3d.current.volume.repaintAllSlices();
        }

    }, [volumeMixRatio]);


    React.useEffect(() => {

        if (obj3d.current.materialVol3D) {
            obj3d.current.materialVol3D.uniforms['u_renderstyle'].value = castIso ? 1 : 0;
            renderAll();
        }

    }, [castIso]);

    React.useEffect(() => {

        if (obj3d.current.materialVol3D) {
            obj3d.current.materialVol3D.uniforms['u_renderthreshold'].value = isothreshold;
        }

    }, [isothreshold]);

    React.useEffect(() => {

        if (obj3d.current.materialVol3D) {
            obj3d.current.materialVol3D.uniforms['u_clim'].value.set(clims[0], clims[1]);
        }

    }, [clims]);


    //when Volume changed (as a result of local file selection) 
    React.useEffect(() => {

        clearBeforeVolumeChange();

        setVolumeLoaded(false);
        setViewMode(StAtm.ViewMode.None);
        setAnimateTransition(false);
        setCameraPOV(StAtm.CameraPOV.Free);

        setIndexX(0);
        setIndexY(0);
        setIndexZ(0);
        setMaxIndexX(0);
        setMaxIndexY(0);
        setMaxIndexZ(0);

        setVolumeValMin(0);
        setVolumeValMax(1);
        setVolumeRange([0, 1]);
        setVolumeMixRatio(1);

        setShowXSlice(false);
        setShowYSlice(false);
        setShowZSlice(true);

        let isLocalFile = typeof volumeFile?.fileOrBlob != 'undefined';
        if (volumeFile) {

            setIsLoading(true);

            //reset ThreeJS object references, except renderers which are conserved
            obj3d.current = {
                renderer: obj3d.current.renderer,
                stats: obj3d.current.stats,
                renderer2: obj3d.current.renderer2,
                aspect2: obj3d.current.aspect2,
                rendX: obj3d.current.rendX,
                rendY: obj3d.current.rendY,
                rendZ: obj3d.current.rendZ,
                disposable: [],
                listeners: [],
            };


            objectURLs.current.forEach((url) => URL.revokeObjectURL(url));
            objectURLs.current = [];

            const manager = new LoadingManager();

            if (isLocalFile) {
                //url modifier to allow manager to read already loaded file 
                manager.setURLModifier((url) => {
                    if (url == SELECTED_FILE_FAKEURL) {
                        url = URL.createObjectURL(fileOrBlob);
                        objectURLs.current.push(url);
                    }
                    return url;
                });
            }

            if (volRendererContainer.current) {

                initSceneBeforeVolumeLoad();

                const niftiloadr = new NIfTILoader(manager);
                //in cvase of local file use already selected & loaded data
                const filename = isLocalFile ? SELECTED_FILE_FAKEURL : volumeFile.name;

                niftiloadr.load(filename,
                    function onload(volume) {
                        if (volume) {
                            initSceneOnVolumeLoaded(volume);
                        }

                        setViewMode(StAtm.ViewMode.Volume3D);
                        setVolumeLoaded(true);
                        setIsLoading(false);
                        setTimeout(renderAll, 150);
                        setAnimateTransition(true);

                    },
                    function onProgress(request: ProgressEvent) {
                        //console.log('onProgress', request)
                    },
                    function onError(e: ErrorEvent) {
                        console.error(e);
                        setAlertMessage(
                            <p>
                                Couldn't load the selected file.
                                <br />

                                {
                                    e.message
                                        ?
                                        <p>Reason:<pre style={{ whiteSpace: 'pre-wrap' }}>{e.message}</pre></p>
                                        :
                                        <span>"Please check it is a valid NIFTi file."</span>
                                }


                            </p>);
                        setIsLoading(false);
                    },

                );
                initSceneAfterVolumeLoaded();

            }
            objectURLs.current.forEach((url) => URL.revokeObjectURL(url));

        }


    }, [volumeFile]
    );


    const adjustSliceCamOnResize = (
        renderer: Renderer | undefined,
        width: number,
        height: number,
        camera: OrthographicCamera | undefined,
        dimNum: number,
    ) => {
        if (renderer && camera) {
            renderer.setSize(width, height);

            const sAspect = width / height;
            const horiz = (dimNum === 2) ? 1 : 2;
            const vert = (dimNum === 0) ? 1 : 0;

            const iLeft = mriBoxMinMax.min[horiz];
            const iRight = mriBoxMinMax.max[horiz];
            const iTop = mriBoxMinMax.max[vert];
            const iBottom = mriBoxMinMax.min[vert];
            const iWidth = iRight - iLeft;
            const iHeight = iTop - iBottom;
            const iAspect = iWidth / iHeight;

            const margin = (iWidth * sAspect / iAspect - iWidth) / 2;

            camera.left = iLeft - margin;
            camera.right = iRight + margin;
            camera.top = iTop;
            camera.bottom = iBottom;
            camera.updateProjectionMatrix();
        }
    };


    //handle resize
    const handleResize = (entries?: ResizeEntry[] | null) => {
        if (viewMode != StAtm.ViewMode.Slice2D) {
            if (obj3d.current.renderer) {
                const renderer = obj3d.current.renderer;
                const volRendCont = volRendererContainer.current;
                if (volRendCont) {
                    renderer.setSize(volRendCont.offsetWidth, volRendCont.offsetHeight);

                    const aspect = volRendCont.offsetWidth / volRendCont.offsetHeight;
                    if (obj3d.current.activeCam) {
                        if (obj3d.current.activeCam === obj3d.current.orthCam) {
                            const { left, right, top, bottom } = getFrustumPlanes(aspect);
                            obj3d.current.orthCam.left = left;
                            obj3d.current.orthCam.right = right;
                            obj3d.current.orthCam.top = top;
                            obj3d.current.orthCam.bottom = bottom;
                            obj3d.current.orthCam.updateProjectionMatrix();

                        } else if (obj3d.current.activeCam === obj3d.current.perspCam) {
                            obj3d.current.perspCam.aspect = aspect;
                            obj3d.current.perspCam.updateProjectionMatrix();
                        }
                    }
                }
            }
        } else {

            const sliceRendPlaceholders = [sliceRendPlaceholder1, sliceRendPlaceholder2, sliceRendPlaceholder3]
            const showISlices = [showXSlice, showYSlice, showZSlice];

            let nextPlaceholderIdx = 0;
            sliceRendPosIndices.forEach(plane => {

                if (showISlices[plane]) {
                    const placeholder = sliceRendPlaceholders[nextPlaceholderIdx];
                    nextPlaceholderIdx++;
                    if (placeholder.current) {
                        const width = placeholder.current.offsetWidth;
                        const height = placeholder.current.offsetHeight;
                        let rendContainer: HTMLDivElement | null = null;
                        if (plane == 0) {
                            rendContainer = sliceXRendererContainer.current;
                            adjustSliceCamOnResize(obj3d.current.rendX, width, height, obj3d.current.camX, 0);
                        } else if (plane == 1) {
                            rendContainer = sliceYRendererContainer.current;
                            adjustSliceCamOnResize(obj3d.current.rendY, width, height, obj3d.current.camY, 1);
                        } else if (plane == 2) {
                            rendContainer = sliceZRendererContainer.current;
                            adjustSliceCamOnResize(obj3d.current.rendZ, width, height, obj3d.current.camZ, 2);
                        }
                        if (rendContainer) {
                            rendContainer.style.top = placeholder.current.offsetTop + 'px';
                            rendContainer.style.left = placeholder.current.offsetLeft + 'px';
                            /*
                            rendContainer.style.height = height + 'px';
                            rendContainer.style.width = width + 'px';
                            */
                        }
                    }
                }
            });
        }

        renderAll();
    };


    //after component is mounted
    React.useEffect(() => {

        //set-up renderers
        const volRendCont = volRendererContainer.current;
        if (volRendCont) {
            const renderer = new WebGLRenderer({
                antialias: true,
            });
            renderer.setSize(volRendCont.offsetWidth, volRendCont.offsetHeight);
            renderer.setClearColor(0x333333, 1);
            renderer.setPixelRatio(window.devicePixelRatio);
            volRendCont.appendChild(renderer.domElement);

            renderer.localClippingEnabled = true;
            obj3d.current.renderer = renderer;

            /*
            const stats = new Stats();
            volRendCont.appendChild(stats.dom);
            obj3d.current.stats = stats;
            */

            const renderer2 = new WebGLRenderer({ alpha: true });
            renderer2.setClearColor(0x000000, 0);

            //set-up inset
            let aspect2 = 1;
            const insetCont = volRendererInset.current;
            if (insetCont) {
                const insetWidth = insetCont.offsetWidth;
                const insetHeight = insetCont.offsetHeight;
                aspect2 = insetWidth / insetHeight;

                renderer2.setSize(insetWidth, insetHeight);
                insetCont.appendChild(renderer2.domElement);
            }


            obj3d.current.renderer2 = renderer2;
            obj3d.current.aspect2 = aspect2;

            const createSliceRenderer = (rendContainer: HTMLDivElement | null) => {
                let renderer: WebGLRenderer | undefined;
                if (rendContainer) {
                    renderer = new WebGLRenderer({
                        antialias: true,
                    });
                    renderer.setSize(rendContainer.offsetWidth, rendContainer.offsetHeight);
                    renderer.setClearColor(0x333333, 1);
                    renderer.setPixelRatio(window.devicePixelRatio);
                    rendContainer.appendChild(renderer.domElement);
                }
                return renderer;
            }

            obj3d.current.rendX = createSliceRenderer(sliceXRendererContainer.current);
            obj3d.current.rendY = createSliceRenderer(sliceYRendererContainer.current);
            obj3d.current.rendZ = createSliceRenderer(sliceZRendererContainer.current);

        }

        //dispose renderers
        return () => {
            clearBeforeVolumeChange();

            const removeRendererDom = (domElement: HTMLDivElement | HTMLCanvasElement | undefined, container: HTMLDivElement | null) => {
                domElement && container && container.removeChild(domElement);
            }
            removeRendererDom(obj3d.current.renderer?.domElement, volRendererContainer.current);
            removeRendererDom(obj3d.current.stats?.dom, volRendererContainer.current);

            removeRendererDom(obj3d.current.renderer2?.domElement, volRendererInset.current);

            removeRendererDom(obj3d.current.rendX?.domElement, sliceXRendererContainer.current);
            removeRendererDom(obj3d.current.rendY?.domElement, sliceYRendererContainer.current);
            removeRendererDom(obj3d.current.rendZ?.domElement, sliceZRendererContainer.current);

            obj3d.current = {
                disposable: [],
                listeners: []
            };
        }

    }, []);

    const clearBeforeVolumeChange = () => {
        if (obj3d.current.volume) {
            //explicitely release slices to prevent leak (since the hold a back reference to the volume)
            obj3d.current.volume.sliceList.length = 0;
        }
        obj3d.current.volume = undefined;
        obj3d.current.scene?.clear();
        //obj3d.current.vol3D = undefined;
        //obj3d.current.scene2?.clear();
        //obj3d.current.renderer?.clear();

        obj3d.current.sliceX?.dispose();
        obj3d.current.sliceY?.dispose();
        obj3d.current.sliceZ?.dispose();
        obj3d.current.sliceXCtrl?.dispose();
        obj3d.current.sliceYCtrl?.dispose();
        obj3d.current.sliceZCtrl?.dispose();
        obj3d.current.dragCtrlX?.dispose();
        obj3d.current.dragCtrlY?.dispose();
        obj3d.current.dragCtrlZ?.dispose();

        //FIXME release border stuff (obj3d.current.sliceX.mesh.children)

        obj3d.current.controls?.dispose();

        //obj3d.current.marksGroup.children.forEach(m => m.dispose());

        //obj3d.current.cube 
        obj3d.current.disposable.forEach(d => d.dispose());
        obj3d.current.listeners.forEach(li => li.dispatcher.removeEventListener(li.event, li.listener));

    };


    const updateInset = () => {
        if (obj3d.current.controls && obj3d.current.activeCam && obj3d.current.camera2 && obj3d.current.scene2) {
            //copy position of the camera into inset
            obj3d.current.camera2.position.copy(obj3d.current.activeCam.position);
            obj3d.current.camera2.position.sub(obj3d.current.controls.target);
            obj3d.current.camera2.position.setLength(300);
            obj3d.current.camera2.lookAt(obj3d.current.scene2.position);

            obj3d.current.renderer2?.render(obj3d.current.scene2, obj3d.current.camera2);
        }
    }

    const renderSliceX = function () {
        if (obj3d.current.rendX && obj3d.current.scene && obj3d.current.camX) {
            obj3d.current.rendX.render(obj3d.current.scene, obj3d.current.camX);
        }
    };
    const renderSliceY = function () {
        if (obj3d.current.rendY && obj3d.current.scene && obj3d.current.camY) {
            obj3d.current.rendY.render(obj3d.current.scene, obj3d.current.camY);
        }
    };
    const renderSliceZ = function () {
        if (obj3d.current.rendZ && obj3d.current.scene && obj3d.current.camZ) {
            obj3d.current.rendZ.render(obj3d.current.scene, obj3d.current.camZ);
        }
    };

    const renderAll = function () {
        if (obj3d.current.scene) {

            if (viewMode != StAtm.ViewMode.Slice2D) {
                if (obj3d.current.activeCam) {

                    updateInset();
                    if (obj3d.current.boxAniMixer) {
                        const delta = clock.current.getDelta();
                        obj3d.current.boxAniMixer.update(delta);
                        //as long as animation isn't finished...
                        if (obj3d.current.boxAninAction?.isRunning()) {
                            //reiterate another rendering
                            //(don't need 60FPS for this animation!)
                            setTimeout(renderAll, 40);
                        }
                    }
                    obj3d.current.renderer?.render(obj3d.current.scene, obj3d.current.activeCam);

                    obj3d.current.stats?.update();
                }
            } else {
                renderSliceX();
                renderSliceY();
                renderSliceZ();
                obj3d.current.stats?.update();
            }
        }
    }

    const updatePerspCam = () => {
        if (obj3d.current.activeCam && obj3d.current.orthCam && obj3d.current.perspCam) {

            console.log('up-P-Cam', obj3d.current.orthCam?.zoom);

            obj3d.current.perspCam?.up.copy(obj3d.current.orthCam.up);
            obj3d.current.perspCam?.position.copy(obj3d.current.orthCam.position);

            obj3d.current.perspCam.fov = 1 / obj3d.current.orthCam?.zoom * Init_PerspCam_FOV;

            obj3d.current.perspCam.lookAt(obj3d.current.scene.position);
            obj3d.current.perspCam?.updateProjectionMatrix();
        }

    };

    const onCameraChanged = () => {
        updatePerspCam();

        //show Volume's bounding-box while rotating
        if (StAtm.ViewMode.Volume3D != rtState.current.viewMode && obj3d.current.boxAninAction) {
            obj3d.current.boxAninAction.stop();
            obj3d.current.boxAninAction.play();
        }
        renderAll();
    };
    //-------------------------------------------------------------------------
    //-------------------------------------------------------------------------

    const initVol3D = (scene: Scene, volume: Volume, initVisibility: boolean) => {
        // Colormap texture
        const cm_texture = new TextureLoader().load(viridis_b64);

        //FIXME: only limited combinations of (format + type) is supported by WebGL
        //(see https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html)
        //For instance Nifti 64bits Float data can not be used for volume rendering
        let data = volume.data;
        //console.debug('volume.dtype   ', volume.dtype);
        if (volume.datatype === Float64Array) {
            data = new Float32Array(volume.data.length);
            (volume.data as Float64Array).forEach((e, i) => data[i] = e / 2);
        } else if (volume.datatype === Int16Array || volume.datatype === Uint16Array) {
            data = new Float32Array(volume.data.length);
            (volume.data as Float64Array).forEach((e, i) => data[i] = e * 1.0);
        }

        //3D volume is drawn in IJK space to be handled correctly by the shader
        const texture = new DataTexture3D(data, volume.xLength, volume.yLength, volume.zLength);

        texture.format = RedFormat;
        texture.type = FloatType;

        texture.minFilter = texture.magFilter = LinearFilter;
        //https://threejs.org/docs/#api/en/textures/Texture.unpackAlignment
        //1 (byte-alignment)
        texture.unpackAlignment = 1;
        texture.needsUpdate = true;

        const shader = VolumeRenderShader1;

        const uniforms = UniformsUtils.clone(shader.uniforms);

        uniforms['u_data'].value = texture;
        uniforms['u_size'].value.set(volume.xLength, volume.yLength, volume.zLength);
        //FIXME magic values
        const valSpan = volume.max - volume.min;
        uniforms['u_clim'].value.set(volume.min + valSpan * .2, volume.min + valSpan * .5);
        setClims([volume.min + valSpan * .2, volume.min + valSpan * .5]);
        uniforms['u_renderstyle'].value = 1; // 0: MIP, 1: ISO
        setCastIso(true);
        uniforms['u_renderthreshold'].value = volume.min + valSpan * .15; // For ISO renderstyle
        setIsothreshold(volume.min + valSpan * .15);
        uniforms['u_cmdata'].value = cm_texture;

        const material = new ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: BackSide // The volume shader uses the backface as its "reference point"
        });

        const geometry = new BoxGeometry(volume.xLength, volume.yLength, volume.zLength);
        //locally center at middle of volume
        geometry.translate(volume.xLength / 2 - 0.5, volume.yLength / 2 - 0.5, volume.zLength / 2 - 0.5);
        geometry.name = 'vol3D-geom';

        const mesh = new Mesh(geometry, material);
        //center back on the origin
        mesh.translateZ(-volume.zLength / 2 + 0.5);
        mesh.translateY(-volume.yLength / 2 + 0.5);
        mesh.translateX(-volume.xLength / 2 + 0.5);
        //orient & relocate as in RAS space        
        mesh.applyMatrix4(volume.matrix);

        mesh.visible = initVisibility;
        mesh.name = 'vol3D-mesh';

        //wrap 3D volume in a group to allow rescaling         
        const wrapper = new Group();
        wrapper.add(mesh);
        //resize to RAS space
        wrapper.scale.set(volume.spacing[AxisIndex.X], volume.spacing[AxisIndex.Y], volume.spacing[AxisIndex.Z]);

        scene.add(wrapper);
        obj3d.current.vol3D = wrapper;
        obj3d.current.materialVol3D = material;

        obj3d.current.disposable.push(geometry, material, texture, cm_texture);
    }

    const initSlices = (scene: Scene, volume: Volume) => {

        //the MRI box in RAS space
        const geometry = new BoxGeometry(...volume.RASDimensions);

        const material = new MeshBasicMaterial({ color: 0x00ff00 });
        //const material = new LineBasicMaterial( { color: 0x8080ff, fog: false, transparent: true, opacity: 0.6 } );
        const cube = new Mesh(geometry, material);
        cube.visible = false;
        //box helper to see the extend of the volume
        const box = new BoxHelper(cube, 0xffff00);
        box.name = 'volMRI-box';
        obj3d.current.cube = cube;

        scene.add(box);
        box.applyMatrix4(volume.matrix);
        scene.add(cube);

        //animation to make the box visible only when camera is moved (rotation, "zoom")
        const visibilityKF = new BooleanKeyframeTrack('.visible', [0, 0.2], [true, false]);
        const clip = new AnimationClip('InAndOut', -1, [visibilityKF]);
        const mixer = new AnimationMixer(box);
        const action = mixer.clipAction(clip);
        action.setLoop(LoopOnce, 1);
        obj3d.current.boxAniMixer = mixer;
        obj3d.current.boxAninAction = action;

        box.visible = false;

        //z plane
        const initSliceZ = Math.floor(volume.zLength / 4);
        const sliceZ = volume.extractSlice(AxisIndex.Z, initSliceZ);
        if (sliceZ.mesh) {
            sliceZ.mesh.material.visible = showZSlice;
            sliceZ.mesh.layers.enable(3);

            {
                sliceZ.mesh.name = 'sliceZ-mesh';
                sliceZ.mesh.userData = { isSlice: true, isBorder: true, axis: AxisIndex.Z };
                const border = new LineSegments(new EdgesGeometry(sliceZ.mesh.geometry),
                    new LineBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.4 })
                );
                border.layers.enable(1);
                border.layers.enable(2);
                sliceZ.mesh.add(border);
            }

            scene.add(sliceZ.mesh);
            obj3d.current.sliceZ = sliceZ;
            setIndexZ(obj3d.current.sliceZ.index);
            setMaxIndexZ(volume.zLength - 1);
        }

        //y plane
        const initSliceY = Math.floor(volume.yLength / 2);
        const sliceY = volume.extractSlice(AxisIndex.Y, initSliceY);
        if (sliceY.mesh) {
            sliceY.mesh.material.visible = showYSlice;
            sliceY.mesh.layers.enable(2);

            {
                sliceY.mesh.name = 'sliceY-mesh';
                sliceY.mesh.userData = { isSlice: true, isBorder: true, axis: AxisIndex.Y };
                const border = new LineSegments(new EdgesGeometry(sliceY.mesh.geometry),
                    new LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4 })
                );
                border.layers.enable(1);
                border.layers.enable(3);
                sliceY.mesh.add(border);
            }


            scene.add(sliceY.mesh);
            obj3d.current.sliceY = sliceY;
            setIndexY(obj3d.current.sliceY.index);
            setMaxIndexY(volume.yLength - 1);
        }
        //x plane
        const initSliceX = Math.floor(volume.xLength / 2);
        const sliceX = volume.extractSlice(AxisIndex.X, initSliceX);
        if (sliceX.mesh) {
            sliceX.mesh.material.visible = showXSlice;
            sliceX.mesh.layers.enable(1);

            {
                sliceX.mesh.name = 'sliceX-mesh';
                sliceX.mesh.userData = { isSlice: true, isBorder: true, axis: AxisIndex.X };
                const border = new LineSegments(new EdgesGeometry(sliceX.mesh.geometry),
                    new LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4 })
                );
                border.layers.enable(2);
                border.layers.enable(3);
                sliceX.mesh.add(border);
            }

            scene.add(sliceX.mesh);
            obj3d.current.sliceX = sliceX;
            setIndexX(obj3d.current.sliceX.index);
            setMaxIndexX(volume.xLength - 1);
        }
        //obj3d.current.sceneX.add(sliceX.mesh);
        setVolumeValMin(volume.min);
        setVolumeValMax(volume.max);
        setVolumeRange([
            volume.windowLow,
            volume.windowHigh
        ]);
    };


    //-------------------------------------------------------------------------

    const getFrustumPlanes = (aspect: number) => {
        const frustumHeight = rtState.current.camDistance ? rtState.current.camDistance : 128;
        return {
            left: - frustumHeight * aspect / 2,
            right: frustumHeight * aspect / 2,
            top: frustumHeight / 2,
            bottom: - frustumHeight / 2,
        };
    }

    const initSceneBeforeVolumeLoad = () => {
        const volRendCont = volRendererContainer.current;
        if (volRendCont) {
            const aspect = volRendCont.offsetWidth / volRendCont.offsetHeight;

            const { left, right, top, bottom } = getFrustumPlanes(aspect);

            const oCamera = new OrthographicCamera(left, right, top, bottom, 1, 1000);
            oCamera.name = 'main-cam-ortho';
            obj3d.current.orthCam = oCamera;
            const pCamera = new PerspectiveCamera(Init_PerspCam_FOV, aspect, 1, 1000);
            pCamera.name = 'main-cam-persp';
            obj3d.current.perspCam = pCamera;

            pCamera.up.copy(oCamera.up);
            obj3d.current.activeCam = oCamera;

            //main scene
            const scene = new Scene();
            scene.add(oCamera);
            scene.add(pCamera);
            obj3d.current.scene = scene;

            // light
            const hemiLight = new HemisphereLight(0xffffff, 0x000000, 1);
            scene.add(hemiLight);

            /*
            const dirLight = new DirectionalLight(0xffffff, 0.5);
            dirLight.position.set(200, 200, 200);
            scene.add(dirLight);
            */
        }

    };

    const initSceneOnVolumeLoaded = (volume: Volume) => {

        if (obj3d.current.renderer && obj3d.current.scene && obj3d.current.activeCam
            && sliceXRendererContainer.current && sliceYRendererContainer.current && sliceZRendererContainer.current
        ) {
            obj3d.current.volume = volume;

            initVol3D(obj3d.current.scene, volume, true);
            initSlices(obj3d.current.scene, volume);

            if (obj3d.current.cube) {
                const mriBbox = new Box3().setFromObject(obj3d.current.cube);
                const mriBoxMinMax = { min: mriBbox.min.toArray(), max: mriBbox.max.toArray() };
                setMRIBoxMinMax(mriBoxMinMax);
                const mriBoxSize = new Vector3();
                mriBbox.getSize(mriBoxSize);

                const mboxZLen = mriBoxSize.toArray()[2];
                const camDistance = 2 * mboxZLen;
                obj3d.current.activeCam.position.z = camDistance;
                rtState.current.camDistance = camDistance;

                //group for landmarks
                obj3d.current.marksGroup = new Group();
                obj3d.current.marksGroup.name = 'marks-group'
                obj3d.current.scene.add(obj3d.current.marksGroup);

                //-- controls for 2D slice view : Pan & Zoom ----------------------
                const sliceXCamDistance = mriBoxMinMax.max[AxisIndex.X] - mriBoxMinMax.min[AxisIndex.X];
                obj3d.current.camX = new OrthographicCamera();
                obj3d.current.camX.layers.set(1);
                obj3d.current.camX.name = 'viewX-cam';
                obj3d.current.scene.add(obj3d.current.camX);

                obj3d.current.camX.up.fromArray([0, 0, 1]);
                obj3d.current.camX.position.fromArray([- sliceXCamDistance, 0, 0]);
                obj3d.current.camX.lookAt(0, 0, 0);

                const sliceYCamDistance = mriBoxMinMax.max[AxisIndex.Y] - mriBoxMinMax.min[AxisIndex.Y];
                obj3d.current.camY = new OrthographicCamera();
                obj3d.current.camY.layers.set(2);
                obj3d.current.camY.name = 'viewY-cam';
                obj3d.current.scene.add(obj3d.current.camY);

                obj3d.current.camY.up.fromArray([0, 0, 1]);
                obj3d.current.camY.position.fromArray([0, sliceYCamDistance, 0, 0]);
                obj3d.current.camY.lookAt(0, 0, 0);

                const sliceZCamDistance = mriBoxMinMax.max[AxisIndex.Z] - mriBoxMinMax.min[AxisIndex.Z];
                obj3d.current.camZ = new OrthographicCamera();
                obj3d.current.camZ.layers.set(3);
                obj3d.current.camZ.name = 'viewZ-cam';
                obj3d.current.scene.add(obj3d.current.camZ);

                obj3d.current.camZ.up.fromArray([0, 1, 0]);
                obj3d.current.camZ.position.fromArray([0, 0, sliceZCamDistance]);
                obj3d.current.camZ.lookAt(0, 0, 0);
                //-----------------------------------------------------------------


                //-- controls for 2D slice view : Pan & Zoom ----------------------
                if (obj3d.current.rendX) {
                    const sliceCtrl = new ArcballControls(obj3d.current.camX, obj3d.current.rendX.domElement);
                    sliceCtrl.enableRotate = false;
                    sliceCtrl.addEventListener('change', renderSliceX);
                    obj3d.current.listeners.push({ event: 'change', listener: renderSliceX, dispatcher: sliceCtrl });
                    obj3d.current.sliceXCtrl = sliceCtrl;
                }
                if (obj3d.current.rendY) {
                    const sliceCtrl = new ArcballControls(obj3d.current.camY, obj3d.current.rendY.domElement);
                    sliceCtrl.enableRotate = false;
                    sliceCtrl.addEventListener('change', renderSliceY);
                    obj3d.current.listeners.push({ event: 'change', listener: renderSliceY, dispatcher: sliceCtrl });
                    obj3d.current.sliceYCtrl = sliceCtrl;
                }
                if (obj3d.current.rendZ) {
                    const sliceCtrl = new ArcballControls(obj3d.current.camZ, obj3d.current.rendZ.domElement);
                    sliceCtrl.enableRotate = false;
                    sliceCtrl.addEventListener('change', renderSliceZ);
                    obj3d.current.listeners.push({ event: 'change', listener: renderSliceZ, dispatcher: sliceCtrl });
                    obj3d.current.sliceZCtrl = sliceCtrl;
                }
                //-----------------------------------------------------------------

                //-- controls for 2D slice view : DnD of landmarks ----------------

                //prevent panning when a landmark is dragged
                const onDragStart = (panControl: ArcballControls) => panControl.enabled = false;

                const onMarkDragEnd = (event: Event, panControl: ArcballControls) => {

                    //re-enable paning
                    panControl.enabled = true;
                    renderAll();
                }
                const attachDragListeners = (dispatcher: EventDispatcher, panControl: ArcballControls) => {
                    let listener: (e: Event) => void;

                    listener = () => onDragStart(panControl);
                    dispatcher.addEventListener('dragstart', listener);
                    obj3d.current.listeners.push({ event: 'dragstart', listener, dispatcher });
                    dispatcher.addEventListener('drag', renderAll);
                    obj3d.current.listeners.push({ event: 'drag', listener: renderAll, dispatcher });
                    listener = (e: Event) => onMarkDragEnd(e, panControl);
                    dispatcher.addEventListener('dragend', listener);
                    obj3d.current.listeners.push({ event: 'dragend', listener: onMarkDragEnd, dispatcher });
                }

                obj3d.current.dragCtrlX = new DragControls([], obj3d.current.camX, sliceXRendererContainer.current);
                obj3d.current.sliceXCtrl && attachDragListeners(obj3d.current.dragCtrlX, obj3d.current.sliceXCtrl);
                obj3d.current.dragCtrlY = new DragControls([], obj3d.current.camY, sliceYRendererContainer.current);
                obj3d.current.sliceYCtrl && attachDragListeners(obj3d.current.dragCtrlY, obj3d.current.sliceYCtrl);
                obj3d.current.dragCtrlZ = new DragControls([], obj3d.current.camZ, sliceZRendererContainer.current);
                obj3d.current.sliceZCtrl && attachDragListeners(obj3d.current.dragCtrlZ, obj3d.current.sliceZCtrl);
                //-----------------------------------------------------------------

                //-- controls for main view (no gizmos)
                const controls = new ArcballControls(obj3d.current.activeCam, obj3d.current.renderer.domElement);

                controls.addEventListener('change', onCameraChanged);
                obj3d.current.listeners.push({ event: 'change', listener: onCameraChanged, dispatcher: controls });

                obj3d.current.controls = controls;

                controls.minDistance = 50;
                controls.maxDistance = 500;

                //zoom range where synchro is not too bad between Orthographic and Perspective cameras
                controls.minZoom = 0.5;
                controls.maxZoom = 10;

                controls.enablePan = false;

                setCameraPOV(StAtm.CameraPOV.Superior);
            }

        }
    };

    const initSceneAfterVolumeLoaded = () => {
        if (obj3d.current.activeCam && obj3d.current.aspect2) {
            // second renderer in an inset to display main view axis orientation 
            const { insetScene: scene2, insetCamera: camera2 } = setupInset(obj3d.current.aspect2, obj3d.current.activeCam);
            obj3d.current.camera2 = camera2;
            obj3d.current.scene2 = scene2;
        }
        obj3d.current.controls?.reset();
    };
    //---------------------------------------------------------------------

    const refreshNormPointer = (container: Element, clientX: number, clientY: number) => {
        const coords = getNormPointer(container, clientX, clientY);
        rtState.current.normPointer.x = coords[0];
        rtState.current.normPointer.y = coords[1];
    };

    const onInsetRendererClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        const coords = getNormPointer(event.currentTarget, event.clientX, event.clientY);

        if (obj3d.current.scene2 && obj3d.current.camera2) {
            //update the picking ray with the camera and pointer position
            const raycaster = new Raycaster();
            raycaster.setFromCamera(new Vector2().fromArray(coords), obj3d.current.camera2);

            // find objects intersecting the picking ray
            const intersects = raycaster.intersectObjects(obj3d.current.scene2.children);

            for (let i = 0; i < intersects.length; i++) {
                const ntrsect = intersects[i];
                if (ntrsect.object?.visible && ntrsect.object.userData?.isAxisSign) {
                    //if axis sign is clicked, change cameraPOV accordingly
                    setCameraPOV(ntrsect.object.userData.axis);
                    break;
                }
            }
        }
    };

    const onRendererClick = (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        camera: OrthographicCamera | undefined,
    ) => {

    };


    const onRendererMouseMove = (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        camera: OrthographicCamera | undefined,
    ) => {

    };


    const showISlices = [showXSlice, showYSlice, showZSlice];

    const nbShown = (showXSlice ? 1 : 0) + (showYSlice ? 1 : 0) + (showZSlice ? 1 : 0);


    /* Note:  moving slice views in the UI can not be achieved simply by changing parent of their renderer container in the grid.
     * Indeed, React reconciliation heuristic would fail, and renderer dom elements (created by ThreeJS) would
     * appear staying in place and swaping parents beteween renders...
     * Hence the need of placeholders and position updates of actual renderer containers.
     */
    const Slice2DViews =
        <div
            style={{
                visibility: (viewMode === StAtm.ViewMode.Slice2D ? 'visible' : 'hidden'),
                position: 'absolute',
                width: '100%', height: '100%',
            }}
        >

            <div
                style={{
                    visibility: (viewMode === StAtm.ViewMode.Slice2D ? 'visible' : 'hidden'),
                    display: 'grid',
                    position: 'absolute',
                    width: '100%', height: '100%',
                    gridTemplateColumns: '33% 33% 34%',
                    gridTemplateRows: '50% 50%',
                    gap: '1px 3px',
                    overflow: 'hidden',
                    backgroundColor: 'silver',
                }}
            >

                <div
                    ref={sliceRendPlaceholder1}
                    style={{
                        ...(nbShown == 1
                            ?
                            //use all available space when only one slice is shown 
                            {
                                gridColumn: '1 / 4',
                                gridRow: '1 / 3',
                            }
                            :
                            {
                                gridColumn: '1 / 3',
                                gridRow: '1 / 3',
                            }
                        )

                    }}
                />

                <div
                    style={{
                        visibility: (viewMode === StAtm.ViewMode.Slice2D && nbShown > 1) ? 'visible' : 'hidden',
                        ...(nbShown == 2
                            ?
                            //use all space in 2nd column when 2 slices are shown 
                            {
                                gridColumn: '3',
                                gridRow: '1 / 3',
                            }
                            :
                            {
                                gridColumn: '3',
                                gridRow: '1',
                            }
                        )
                    }}
                >
                    <div
                        ref={sliceRendPlaceholder2}
                        style={{
                            position: 'relative',
                            height: '100%',
                            width: '100%',
                        }}
                    >
                        <div
                            style={{ position: 'absolute', top: 1, left: 1, color: '#FFF', zIndex: 20 }}
                            title="expand this slice view"
                        >
                            <Icon
                                icon='zoom-to-fit'
                                onClick={() => {
                                    //swap positions of 1rst and 2nd slice viewers 
                                    if (nbShown > 2) {
                                        setSliceRendPosIndices([
                                            sliceRendPosIndices[1],
                                            sliceRendPosIndices[0],
                                            sliceRendPosIndices[2]
                                        ]);

                                    } else {
                                        //exclude non-visible slices 
                                        const sorted = sliceRendPosIndices
                                            .map((plane, index) => ({
                                                plane,
                                                index,
                                                visible: showISlices[plane]
                                            }))
                                            .sort(
                                                (a, b) => {
                                                    if (a.visible && !b.visible) {
                                                        return -1;
                                                    }
                                                    else if (!a.visible && b.visible) {
                                                        return 1;
                                                    } else {
                                                        return a.index - b.index
                                                    }
                                                }
                                            )
                                            .map(s => s.plane)
                                            ;

                                        setSliceRendPosIndices([
                                            sorted[1],
                                            sorted[0],
                                            sorted[2]
                                        ]);

                                    }
                                }
                                }
                            />
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        visibility: (viewMode === StAtm.ViewMode.Slice2D && nbShown > 2) ? 'visible' : 'hidden',

                        gridColumn: '3',
                        gridRow: '2 ',
                    }}
                >
                    <div
                        ref={sliceRendPlaceholder3}
                        style={{
                            position: 'relative',
                            height: '100%',
                            width: '100%',
                        }}
                    >
                        <div
                            style={{ position: 'absolute', top: 1, left: 1, color: '#FFF', zIndex: 20 }}
                            title="expand this slice view"
                        >
                            <Icon
                                icon='zoom-to-fit'
                                onClick={() =>
                                    //swap positions of 1rst and 3rd slice viewers 

                                    setSliceRendPosIndices([
                                        sliceRendPosIndices[2],
                                        sliceRendPosIndices[1],
                                        sliceRendPosIndices[0],
                                    ])
                                } />
                        </div>
                    </div>
                </div>
            </div>

            <div
                ref={sliceZRendererContainer}
                className='sliceRendererContainer'
                style={{
                    position: 'absolute',
                    visibility: (viewMode === StAtm.ViewMode.Slice2D && showZSlice) ? 'visible' : 'hidden',
                }}
                onClick={(event) =>
                    onRendererClick(event, obj3d.current.camZ)
                }
                onMouseMove={(event) =>
                    onRendererMouseMove(event, obj3d.current.camZ)
                }
            />
            <div
                ref={sliceYRendererContainer}
                className='sliceRendererContainer'
                style={{
                    position: 'absolute',
                    visibility: (viewMode === StAtm.ViewMode.Slice2D && showYSlice) ? 'visible' : 'hidden',
                }}
                onClick={(event) =>
                    onRendererClick(event, obj3d.current.camY)
                }
                onMouseMove={(event) =>
                    onRendererMouseMove(event, obj3d.current.camY)
                }
            />
            <div
                ref={sliceXRendererContainer}
                className='sliceRendererContainer'
                style={{
                    position: 'absolute',
                    visibility: (viewMode === StAtm.ViewMode.Slice2D && showXSlice) ? 'visible' : 'hidden',
                }}
                onClick={(event) =>
                    onRendererClick(event, obj3d.current.camX)
                }
                onMouseMove={(event) =>
                    onRendererMouseMove(event, obj3d.current.camX)
                }
            />

        </div>;

    return (

        <div
            style={{
                maxWidth: '100%',
                maxHeight: '100%',
                height: '100%',
                userSelect: 'none',
            }}
        >
            <div
                style={{
                    ...{
                        margin: 2,
                        width: 'calc(100% - 4px)', height: 'calc(100% - 4px)',
                        overflow: 'hidden',
                        display: 'grid',
                    },
                    ...(props.inlineControls ?
                        { backgroundColor: "transparent" }
                        :
                        {
                            gridTemplateColumns: 'minmax(0, 75%) minmax(190px, 25%)',
                            gridTemplateRows: '100%',
                            gap: '1px 3px',
                        }
                    )
                }}
            >
                <ResizeSensor2
                    onResize={handleResize}
                >
                    <div
                        style={{
                            maxWidth: '100%', maxHeight: '100%', position: 'relative',
                        }}
                    >
                        {isLoading
                            ?
                            <div
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    backgroundColor: '#00000047',
                                    border: 'none',
                                    margin: 'auto',
                                    padding: 0,
                                    position: 'absolute',
                                    zIndex: 200,
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <Spinner size={SpinnerSize.LARGE} />
                            </div>
                            :
                            null
                        }
                        {alertMessage
                            ?
                            <Alert
                                confirmButtonText="Close"
                                isOpen={typeof alertMessage != 'undefined'}
                                canEscapeKeyCancel={true}
                                canOutsideClickCancel={true}
                                onClose={() => {
                                    setAlertMessage(undefined);
                                }}
                            >
                                {alertMessage}
                            </Alert>
                            :
                            null
                        }

                        {/* 3D Volume and 3D slices renderer */}
                        <div
                            className="volRendererCont"
                            style={{
                                visibility: (viewMode != StAtm.ViewMode.Slice2D ? 'visible' : 'hidden'),
                                position: 'absolute',
                                width: '100%', height: '100%',
                                backgroundColor: '#000'
                            }}

                            ref={volRendererContainer}
                            onClick={(event) =>
                                onRendererClick(event, obj3d.current.activeCam)
                            }
                            onMouseMove={(event) =>
                                onRendererMouseMove(event, obj3d.current.activeCam)
                            }
                        >
                        </div>
                        <div
                            ref={volRendererInset}
                            style={{
                                visibility: (viewMode != StAtm.ViewMode.Slice2D ? 'visible' : 'hidden'),
                                width: 100,
                                height: 100,
                                backgroundColor: '#0000001c', /* or transparent; will show through only if renderer alpha: true */
                                borderRadius: 100,
                                margin: 0,
                                padding: 0,
                                position: 'absolute',
                                left: 10,
                                bottom: 10,
                                zIndex: 100,
                            }}
                            onClick={(event) => onInsetRendererClick(event)}
                        >
                        </div>
                        {/* 2D slices views */}
                        {Slice2DViews}

                        {focusedRegion
                            ?
                            <div
                                style={{
                                    border: 'none',
                                    margin: 'auto',
                                    paddingTop: 3,
                                    position: 'absolute',
                                    left: 0,
                                    width: '100%',
                                    zIndex: 200,
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <span
                                    style={{
                                        backgroundColor: '#00000047',
                                        color: '#FFF',
                                        padding: '4px 8px',
                                        borderStyle: 'solid',
                                        borderWidth: 1,
                                        borderColor: `rgba(${focusedRegion.color})`,
                                    }}
                                >{focusedRegion.abbrev}</span>
                            </div>
                            :
                            null
                        }

                    </div>
                </ResizeSensor2>

                <div
                    style={{
                        ...(props.inlineControls ?
                            {
                                position: 'absolute',
                                backgroundColor: '#918f8f3b',
                            }
                            :
                            {}
                        )
                    }}
                >
                    <PreviewControls inline={props.inlineControls} />
                </div>

            </div >

        </div >

    );

};

export default VolumePreview;
