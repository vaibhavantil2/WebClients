import { useEffect, useRef, useState } from 'react';

import DOMPurify from 'dompurify';
import { c } from 'ttag';

import { CircleLoader } from '@proton/atoms/CircleLoader';
import { isFirefox } from '@proton/shared/lib/helpers/browser';
import { stringToUint8Array, uint8ArrayToString } from '@proton/shared/lib/helpers/encoding';
import { isSVG } from '@proton/shared/lib/helpers/mimetype';

import { classnames } from '../..';
import useElementRect from '../../hooks/useElementRect';
import UnsupportedPreview from './UnsupportedPreview';
import ZoomControl from './ZoomControl';

interface Props {
    mimeType: string;
    onDownload?: () => void;
    contents?: Uint8Array[];
    placeholderSrc?: string;
    isLoading: boolean;
}

const FALLBACK_IMAGE_DIMENSION_VALUE = window.innerHeight / 2;

// These are just arbitrary numbers to keep image reasonable size
// on giant screens when we don't have information about image
// dimensions
const DEFAULT_IMAGE_DIMENSION_LIMIT_WIDTH = 2400;
const DEFAULT_IMAGE_DIMENSION_LIMIT_HEIGHT = 1400;

/*
 * Svg image dimension are 0 in Firefox. For these cases fallback values
 * will be used, so the image preview is visible.
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1328124
 */
function getImageNaturalDimensions(imageElement: HTMLImageElement | null) {
    return {
        height: imageElement?.naturalHeight || FALLBACK_IMAGE_DIMENSION_VALUE,
        width: imageElement?.naturalWidth || FALLBACK_IMAGE_DIMENSION_VALUE,
    };
}

/**
 * SVG can contain nasty scripts. We do have security headers set but attacker
 * can overcome it by asking user to open the previewed image in the new tab,
 * where browsers don't check headers and allow scripts from the SVG.
 * One option would be to render it as PNG, but zooming or rescaling the window
 * would mean to redraw. Better to keep SVG then. Sanitizing small SVGs takes
 * milliseconds, bigger ones (MBs) under second. Only super huge ones takes even
 * 10 seconds on slow computer as is mine, but we talk about huge SVGs as 30 MB.
 * Because such SVG is more edge case, we can live with that.
 */
function sanitizeSVG(contents: Uint8Array[]): Uint8Array[] {
    const contentsString = contents.map(uint8ArrayToString).join('');
    const sanitzedSVG = DOMPurify.sanitize(contentsString);
    return [stringToUint8Array(sanitzedSVG)];
}

const ImagePreview = ({ isLoading = false, mimeType, contents, onDownload, placeholderSrc }: Props) => {
    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const containerBounds = useElementRect(containerRef);

    const [error, setError] = useState(false);
    const [thumbnailScale, setThumbnailScale] = useState(0);
    const [scale, setScale] = useState(0);
    const [imageData, setImageData] = useState({
        src: '',
    });
    const [ready, setReady] = useState(false);
    const timeoutId = useRef<ReturnType<typeof setTimeout>>();

    const handleZoomOut = () => setScale((zoom) => (zoom ? zoom * 0.9 : 1));
    const handleZoomIn = () => setScale((zoom) => (zoom ? zoom * 1.1 : 1));

    const fitToContainer = () => {
        if (!imageRef.current || !containerBounds) {
            return;
        }

        const heightLimit = Math.min(containerBounds.height, DEFAULT_IMAGE_DIMENSION_LIMIT_HEIGHT);
        const widthLimit = Math.min(containerBounds.width, DEFAULT_IMAGE_DIMENSION_LIMIT_WIDTH);

        const dimensions = getImageNaturalDimensions(imageRef.current);
        const heightRatio = heightLimit / dimensions.height;
        const widthRatio = widthLimit / dimensions.width;

        const scale = Math.min(heightRatio, widthRatio);

        if (isLoading) {
            setThumbnailScale(scale);
        } else {
            setScale(scale);
        }
    };

    const handleBrokenImage = () => {
        if (!error) {
            setError(true);
        }
    };

    const handleFullImageLoaded = () => {
        if (isFirefox()) {
            // Setting the flag with arbitrary timeout value to hide thumbnail image with a delay.
            // Firefox tends to insert bigger images slowly, which lead to flickering.
            // Example:
            // 1. Data of full-size image loads
            // 2. We hide the thumbnail
            // 3. Before the full image is properly inserted into DOM, we see preview overlay background
            setTimeout(() => setReady(true), 200);
        } else {
            setReady(true);
        }

        fitToContainer();
    };

    const dimensions = getImageNaturalDimensions(imageRef.current);
    const scaledDimensions = {
        height: dimensions.height * (scale || thumbnailScale),
        width: dimensions.width * (scale || thumbnailScale),
    };

    const styles = isLoading ? {} : scaledDimensions;
    const shouldHideZoomControls = !ready;

    useEffect(() => {
        if (error) {
            setError(false);
        }

        if (!contents) {
            setImageData({ src: '' });
            return;
        }

        const data = isSVG(mimeType) ? sanitizeSVG(contents) : contents;
        const blob = new Blob(data, { type: mimeType });
        const srcUrl = URL.createObjectURL(blob);

        setImageData({
            src: srcUrl,
        });

        // Load image before rendering
        const buffer = new Image();
        buffer.src = srcUrl;

        return () => {
            if (srcUrl) {
                URL.revokeObjectURL(srcUrl);
            }
        };
    }, [contents, mimeType]);

    useEffect(() => {
        return () => {
            clearTimeout(timeoutId.current);
        };
    }, []);

    return (
        <>
            <div ref={containerRef} className="file-preview-container">
                {error ? (
                    <UnsupportedPreview onDownload={onDownload} type="image" />
                ) : (
                    <div
                        className="flex-no-min-children mauto relative"
                        style={{
                            ...scaledDimensions,
                            // TODO: fix dimensions calculation and uncomment
                            // Add checkered background to override any theme
                            // so transparent images are better visible.
                            // background: isLoading
                            //     ? ''
                            //     : 'repeating-conic-gradient(#606060 0% 25%, transparent 0% 50%) 50% / 20px 20px',
                            overflow: 'hidden',
                        }}
                    >
                        {!isLoading && (
                            <img
                                onLoad={handleFullImageLoaded}
                                onError={handleBrokenImage}
                                className={classnames(['file-preview-image file-preview-image-full-size'])}
                                style={styles}
                                src={imageData.src}
                                alt={c('Info').t`Preview`}
                            />
                        )}
                        <img
                            ref={imageRef}
                            onLoad={fitToContainer}
                            onError={handleBrokenImage}
                            className={classnames(['file-preview-image', ready && 'hide'])}
                            style={{
                                ...scaledDimensions,
                                // Blurring an image this way leads to its edges to become transparent.
                                // To compensate this, we apply scale transformation.
                                filter: 'blur(3px)',
                                transform: 'scale(1.03)',
                            }}
                            src={placeholderSrc}
                            alt={c('Info').t`Preview`}
                        />
                    </div>
                )}
            </div>
            {/* TODO: check if these conditions can be simplified/cleaned up. Those for loading
            should more or less match the ones for zoom controls. */}
            {!ready && (
                <div
                    className={classnames([
                        'file-preview-loading w100 mb2 flex flex-justify-center flex-align-items-center',
                    ])}
                >
                    <CircleLoader />
                    <span className="ml1">{c('Info').t`Loading...`}</span>
                </div>
            )}
            {!error && (
                <ZoomControl
                    className={shouldHideZoomControls ? 'visibility-hidden' : ''}
                    onReset={fitToContainer}
                    scale={scale}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                />
            )}
        </>
    );
};

export default ImagePreview;
