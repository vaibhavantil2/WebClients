import { useMemo } from 'react';

import { Vr } from '@proton/atoms';
import { Toolbar, useActiveBreakpoint } from '@proton/components';
import { getDevice } from '@proton/shared/lib/helpers/browser';

import { DecryptedLink } from '../../../store';
import { useSelection } from '../../FileBrowser';
import {
    DetailsButton,
    DownloadButton,
    LayoutButton,
    PreviewButton,
    RenameButton,
    ShareFileButton,
    ShareLinkButton,
} from '../ToolbarButtons';
import { getSelectedItems } from '../helpers';
import useIsEditEnabled from '../useIsEditEnabled';
import {
    ActionsDropdown,
    CreateNewFileButton,
    CreateNewFolderButton,
    MoveToFolderButton,
    MoveToTrashButton,
    UploadFileButton,
    UploadFolderButton,
} from './ToolbarButtons';

interface Props {
    shareId: string;
    linkId: string;
    items: DecryptedLink[];
    showOptionsForNoSelection?: boolean;
    isLinkReadOnly?: boolean;
}

const DriveToolbar = ({ shareId, items, showOptionsForNoSelection = true, isLinkReadOnly }: Props) => {
    const isDesktop = !getDevice()?.type;
    const { isNarrow } = useActiveBreakpoint();
    const selectionControls = useSelection()!;
    const isEditEnabled = useIsEditEnabled();

    const selectedItems = useMemo(
        () => getSelectedItems(items, selectionControls!.selectedItemIds),
        [items, selectionControls!.selectedItemIds]
    );

    const renderSelectionActions = () => {
        if (!selectedItems.length) {
            if (!showOptionsForNoSelection) {
                return null;
            }
            return (
                <>
                    {!isLinkReadOnly ? (
                        <>
                            <CreateNewFolderButton />
                            <Vr />
                        </>
                    ) : null}
                    {isEditEnabled && !isLinkReadOnly && <CreateNewFileButton />}
                    {isDesktop && !isLinkReadOnly ? (
                        <>
                            <UploadFolderButton />
                            <UploadFileButton />
                            <Vr />
                        </>
                    ) : null}
                    <ShareFileButton shareId={shareId} />
                </>
            );
        }

        return (
            <>
                <PreviewButton selectedLinks={selectedItems} />
                <DownloadButton selectedLinks={selectedItems} />
                {isNarrow ? (
                    <ActionsDropdown shareId={shareId} selectedLinks={selectedItems} />
                ) : (
                    <>
                        <ShareLinkButton selectedLinks={selectedItems} />
                        <Vr />
                        {!isLinkReadOnly ? (
                            <>
                                <MoveToFolderButton shareId={shareId} selectedLinks={selectedItems} />
                                <RenameButton selectedLinks={selectedItems} />
                            </>
                        ) : null}
                        <DetailsButton selectedLinks={selectedItems} />
                        <Vr />
                        <MoveToTrashButton selectedLinks={selectedItems} />
                    </>
                )}
            </>
        );
    };

    return (
        <Toolbar>
            {renderSelectionActions()}
            <span className="mlauto flex flex-nowrap">
                <LayoutButton />
            </span>
        </Toolbar>
    );
};

export default DriveToolbar;
