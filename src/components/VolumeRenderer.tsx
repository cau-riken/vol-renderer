import React from "react";
import { useAtom, Provider } from "jotai";

import {
    FocusStyleManager,
} from "@blueprintjs/core";

import * as StAtm from '../StateAtoms';

import { VolumePreview } from "./VolumePreview"

FocusStyleManager.onlyShowFocusOnTabs();


const detectWebGLContext = () => {
    try {
        // canvas element (no need to add it to the DOM)
        const canvas = document.createElement("canvas");
        // get WebGLRenderingContext from canvas element.
        const gl = canvas.getContext("webgl")
            || canvas.getContext("experimental-webgl");
        return Boolean(gl && gl instanceof WebGLRenderingContext);
    } catch (e) {
        return false;
    }
};


const VolumePreviewWrapper = (props: VolumeRendererProps) => {

    const [isWebGlEnabled, setWebGlEnabled] = React.useState<boolean>();
    const [volumeFile, setVolumeFile] = useAtom(StAtm.volumeFile);
    const [, setAlertMessage] = useAtom(StAtm.alertMessage);


    const loadLocalVolumeFile = (file: File | string) => {

        if (volumeFile) {
            volumeFile.fileOrBlob = undefined;
        }
        setVolumeFile(undefined);

        let isLocalFile;
        let fileName;
        if (typeof file === "string") {
            isLocalFile = false;
            fileName = file;
        } else {
            isLocalFile = true;
            fileName = file.name;
        }
        const fileExt = fileName.toUpperCase().split('.').pop();

        // check for files with no extension
        const fileExtension =
            (!fileExt || fileExt == fileName.toUpperCase())
                ?
                // this must be dicom
                'DCM'
                :
                fileExt
            ;

        //files extension of recognized volumes
        //const volumeExtensions = ['NRRD', 'MGZ', 'MGH', 'NII', 'GZ', 'DCM', 'DICOM'];
        const volumeExtensions = ['NII', 'GZ'];
        const seemsValidFile = (volumeExtensions.indexOf(fileExtension) >= 0);
        if (seemsValidFile) {
            setVolumeFile({
                fileOrBlob: (isLocalFile ? file : undefined),
                name: fileName,
            });

        } else {
            setAlertMessage(<span>The selected file doesn't seem to be a valid NIfTI file.</span>);
        }

    };




    React.useEffect(() => {
        const isWebGlEnabled = detectWebGLContext();
        setWebGlEnabled(isWebGlEnabled);

        if (isWebGlEnabled) {
            if (typeof props.file != "undefined") {
                setTimeout(() => {
                    loadLocalVolumeFile(props.file);
                },
                    200);
            } else if (typeof props.url != "undefined") {
                setTimeout(() => {
                    loadLocalVolumeFile(props.url);
                },
                    500);
            } else {
                setAlertMessage(<span>No specified NIfTI file or url.</span>);
            }
        }

    }, []
    );

    return (
        (isWebGlEnabled === false) ?
            <div
                style={{
                    width: '100%',
                    textAlign: 'center',
                    paddingTop: 50,
                    fontSize: 'large',
                    color: 'orangered'
                }}
            >Preview can not be displayed because WebGL is not available on this browser!</div>
            :
            <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
                <VolumePreview 
                    inlineControls={props.inlineControls}
                />
            </div>

    );

}

export type VolumeRendererProps = {
    url?: string,
    file?: File,
    inlineControls? : boolean,
};

export const VolumeRenderer = (props: VolumeRendererProps) =>
    //each concurrent renderer have their own state provider
    <Provider>
        <VolumePreviewWrapper {...props} />
    </Provider>
    ;

export default VolumeRenderer;
