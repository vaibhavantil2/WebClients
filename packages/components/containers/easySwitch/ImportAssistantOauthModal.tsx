import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { c } from 'ttag';

import isTruthy from '@proton/shared/lib/helpers/isTruthy';
import { Address } from '@proton/shared/lib/interfaces';
import { toMap } from '@proton/shared/lib/helpers/object';
import { createCalendar, removeCalendar } from '@proton/shared/lib/api/calendars';
import { setupCalendarKey } from '@proton/components/containers/keys/calendar';
import { getPrimaryKey } from '@proton/shared/lib/keys';
import {
    createImportCalendar,
    createImportContacts,
    createImportMail,
    createToken,
    startImportTask,
} from '@proton/shared/lib/api/easySwitch';
import {
    CheckedProductMap,
    IAOauthModalModel,
    IAOauthModalModelStep,
    OAuthProps,
    OAUTH_PROVIDER,
    ImportType,
    LaunchImportPayload,
    TIME_PERIOD,
    ImportToken,
    IAOauthModalModelImportData,
    CalendarImporterPayload,
    AuthenticationMethod,
    MailImporterPayload,
    MailImportMapping,
    ImportedMailFolder,
    ImportedCalendar,
    CalendarImportMapping,
} from '@proton/shared/lib/interfaces/EasySwitch';
import { getActiveAddresses } from '@proton/shared/lib/helpers/address';
import { PRODUCT_NAMES, LABEL_COLORS } from '@proton/shared/lib/constants';
import { noop, randomIntFromInterval } from '@proton/shared/lib/helpers/function';

import { Button, FormModal, PrimaryButton, useSettingsLink } from '../../components';
// import Wizard from '../../components/wizard/Wizard';

import {
    G_OAUTH_SCOPE_DEFAULT,
    G_OAUTH_SCOPE_MAIL,
    G_OAUTH_SCOPE_CONTACTS,
    G_OAUTH_SCOPE_CALENDAR,
    IA_PATHNAME_REGEX,
    CALENDAR_TO_BE_CREATED_PREFIX,
    IMAPS,
} from './constants';

import IASelectImportTypeStep from './steps/IASelectImportTypeStep';
import useOAuthPopup from '../../hooks/useOAuthPopup';
import ImportStartedStep from './steps/IAImportStartedStep';
import {
    useApi,
    useCalendars,
    useErrorHandler,
    useEventManager,
    useFolders,
    useGetAddressKeys,
    useLabels,
} from '../../hooks';
import IALoadingStep from './steps/IALoadingStep';
import { dateToTimestamp } from './mail/helpers';

interface Props {
    addresses: Address[];
    onClose?: () => void;
    defaultCheckedTypes?: ImportType[];
}

const {
    MAIL,
    CALENDAR,
    CONTACTS,
    // DRIVE,
} = ImportType;

const { AUTHENTICATION, SELECT_IMPORT_TYPE, SUCCESS } = IAOauthModalModelStep;

const DEFAULT_IMAP_PORT = 993;

const ImportAssistantOauthModal = ({ addresses, onClose = noop, defaultCheckedTypes = [], ...rest }: Props) => {
    const activeAddresses = getActiveAddresses(addresses);
    const getAddressKeys = useGetAddressKeys();
    const location = useLocation();
    const isCurrentLocationImportPage = IA_PATHNAME_REGEX.test(location.pathname);
    const settingsLink = useSettingsLink();
    const api = useApi();
    const { call } = useEventManager();
    const errorHandler = useErrorHandler();

    const [labels = [], loadingLabels] = useLabels();
    const [folders = [], loadingFolders] = useFolders();
    const [calendars = [], loadingCalendars] = useCalendars();

    const isInitLoading = loadingLabels || loadingFolders || loadingCalendars;

    const [modalModel, setModalModel] = useState<IAOauthModalModel>({
        step: AUTHENTICATION,
        AddressID: addresses[0].ID,
        importedEmail: '',
        payload: {
            ImporterID: '',
        },
        isPayloadInvalid: false,
        data: {
            [MAIL]: {
                importerID: '',
                selectedPeriod: TIME_PERIOD.BIG_BANG,
                providerFolders: [],
            },
            [CALENDAR]: {
                importerID: '',
                providerCalendars: [],
            },
            [CONTACTS]: {
                importerID: '',
                numContacts: 0,
                numContactGroups: 0,
            },
            // [DRIVE]: {
            //     importerID: '',
            // },
        },
    });

    const addressMap = toMap(addresses);

    // for a finer control of loading states we use useState here
    const [isLoadingOAuth, setIsLoadingOAuth] = useState(false);
    const [isLoadingCreateCalendars, setIsLoadingCreateCalendars] = useState(false);
    const [isLoadingStartImportTask, setIsLoadingStartImportTask] = useState(false);

    const showLoadingState = isInitLoading || isLoadingOAuth || isLoadingCreateCalendars || isLoadingStartImportTask;

    const [calendarsToBeCreatedCount, setCalendarsToBeCreatedCount] = useState(0);
    const [createdCalendarsCount, setCreatedCalendarsCount] = useState(0);

    const [checkedTypes, setCheckedTypes] = useState<CheckedProductMap>({
        [MAIL]: defaultCheckedTypes?.includes(MAIL),
        [CALENDAR]: defaultCheckedTypes?.includes(CALENDAR),
        [CONTACTS]: defaultCheckedTypes?.includes(CONTACTS),
        // [DRIVE]: defaultCheckedTypes?.includes(ImportType.DRIVE),
    });

    const { triggerOAuthPopup } = useOAuthPopup();

    const selectedImportTypes = Object.keys(checkedTypes).reduce<ImportType[]>((acc, k) => {
        const key = k as ImportType;
        if (checkedTypes[key]) {
            acc.push(key);
        }
        return acc;
    }, []);

    const createCalendars = async (calendarsToBeCreated: CalendarImportMapping[]) => {
        if (!activeAddresses.length) {
            throw new Error(c('Error').t`No valid address found`);
        }

        setCalendarsToBeCreatedCount(calendarsToBeCreated.length);

        const [{ ID: addressID }] = activeAddresses;
        const { privateKey: primaryAddressKey } = getPrimaryKey(await getAddressKeys(addressID)) || {};

        if (!primaryAddressKey) {
            throw new Error(c('Error').t`Primary address key is not decrypted.`);
        }

        const newMapping = await Promise.all(
            calendarsToBeCreated.map(async ({ Source, Destination }) => {
                const { Calendar } = await api(
                    createCalendar({
                        Name: Destination.replace(CALENDAR_TO_BE_CREATED_PREFIX, ''),
                        Color: LABEL_COLORS[randomIntFromInterval(0, LABEL_COLORS.length - 1)],
                        Description: '',
                        Display: 1,
                        AddressID: addressID,
                    })
                );

                await setupCalendarKey({
                    api,
                    calendarID: Calendar.ID,
                    addresses: activeAddresses,
                    getAddressKeys,
                });

                setCreatedCalendarsCount(createdCalendarsCount + 1);

                return { Source, Destination: Calendar.ID };
            })
        );

        return newMapping;
    };

    const handleSubmit = async () => {
        if (modalModel.step === AUTHENTICATION) {
            const scopes = [
                ...G_OAUTH_SCOPE_DEFAULT,
                checkedTypes[MAIL] && G_OAUTH_SCOPE_MAIL,
                checkedTypes[CALENDAR] && G_OAUTH_SCOPE_CALENDAR,
                checkedTypes[CONTACTS] && G_OAUTH_SCOPE_CONTACTS,
                // checkedTypes[DRIVE] && G_OAUTH_SCOPE_DRIVE,
            ]
                .filter(isTruthy)
                .flat(1);

            triggerOAuthPopup({
                provider: OAUTH_PROVIDER.GOOGLE,
                scope: scopes.join(' '),
                callback: async (oauthProps: OAuthProps) => {
                    setIsLoadingOAuth(true);
                    try {
                        const { Code, Provider, RedirectUri } = oauthProps;

                        const { Token }: { Token: ImportToken } = await api(
                            createToken({
                                Provider,
                                Code,
                                RedirectUri,
                                // @todo Source: 'import-settings',
                            })
                        );

                        const { Products, ID, Account } = Token;

                        const tokenScope = Products;

                        const createdImports = await Promise.all(
                            tokenScope.map(async (importType) => {
                                if (importType === MAIL) {
                                    // const { Importer } = await api(createImportMail(ID));
                                    const { Importer } = await api(
                                        createImportMail({
                                            TokenID: ID,
                                            ImapHost: IMAPS[Provider],
                                            ImapPort: DEFAULT_IMAP_PORT,
                                            Sasl: AuthenticationMethod.OAUTH,
                                        })
                                    );

                                    return {
                                        importType,
                                        importID: Importer.ID,
                                        Folders: Importer.Folders,
                                    };
                                }

                                if (importType === CALENDAR) {
                                    const { Importer } = await api(createImportCalendar(ID));

                                    return {
                                        importType,
                                        importID: Importer.ID,
                                        Calendars: Importer.Calendars,
                                    };
                                }

                                if (importType === CONTACTS) {
                                    const { Importer } = await api(createImportContacts(ID));
                                    const { NumContacts, NumGroups } = Importer;

                                    return {
                                        importType,
                                        importID: Importer.ID,
                                        NumContacts,
                                        NumGroups,
                                    };
                                }
                            })
                        );

                        const filteredCreatedImports: {
                            importType: ImportType;
                            importID: string;
                            Folders?: ImportedMailFolder[];
                            Calendars?: ImportedCalendar[];
                            NumContacts?: number;
                            NumGroups?: number;
                        }[] = createdImports.filter(isTruthy);

                        const data = filteredCreatedImports.reduce<IAOauthModalModelImportData>(
                            (acc, currentImport) => {
                                const { importType, importID: importerID } = currentImport;

                                if (importType === MAIL && currentImport.Folders) {
                                    acc[importType].providerFolders = currentImport.Folders;
                                }

                                if (importType === CALENDAR && currentImport.Calendars) {
                                    acc[importType].providerCalendars = currentImport.Calendars;
                                }

                                if (importType === CONTACTS) {
                                    acc[importType].numContacts = currentImport.NumContacts || 0;
                                    acc[importType].numContactGroups = currentImport.NumGroups || 0;
                                }

                                return {
                                    ...acc,
                                    [importType]: {
                                        ...acc[importType],
                                        importerID,
                                    },
                                };
                            },
                            {
                                ...modalModel.data,
                            }
                        );

                        setModalModel({
                            ...modalModel,
                            step: SELECT_IMPORT_TYPE,
                            importedEmail: Account,
                            oauthProps,
                            tokenScope,
                            data,
                        });
                        setIsLoadingOAuth(false);
                    } catch (error) {
                        setIsLoadingOAuth(false);
                        errorHandler(error);
                    }
                },
            });
            return;
        }

        if (modalModel.step === SELECT_IMPORT_TYPE) {
            const payloads = modalModel.payload;

            const calendarPayload = payloads[ImportType.CALENDAR] as CalendarImporterPayload;

            let createdCalendarMapping;

            const calendarsToBeCreated =
                modalModel.payload[ImportType.CALENDAR]?.Mapping.filter((m) =>
                    m.Destination.startsWith(CALENDAR_TO_BE_CREATED_PREFIX)
                ) || [];

            if (payloads[ImportType.CALENDAR] && calendarsToBeCreated.length) {
                setIsLoadingCreateCalendars(true);
                try {
                    createdCalendarMapping = await createCalendars(calendarsToBeCreated);
                    await call();
                    calendarPayload.Mapping = [
                        ...calendarPayload.Mapping.filter(
                            (m) => !m.Destination.startsWith(CALENDAR_TO_BE_CREATED_PREFIX)
                        ),
                        ...createdCalendarMapping,
                    ];
                    setIsLoadingCreateCalendars(false);
                } catch (error) {
                    setIsLoadingCreateCalendars(false);
                    errorHandler(error);
                }
            }

            const payloadKeys = Object.keys(payloads) as ImportType[];
            const apiPayload = payloadKeys
                .filter((key) => Object.values(ImportType).includes(key))
                .filter((importType) => selectedImportTypes.includes(importType))
                .reduce<LaunchImportPayload>(
                    (acc, importType) => {
                        // Format mail payload
                        if (importType === ImportType.MAIL) {
                            const payload = payloads[ImportType.MAIL] as MailImporterPayload;

                            return {
                                ...acc,
                                [importType]: {
                                    ...payload,
                                    StartTime: payload.StartTime
                                        ? dateToTimestamp(payload.StartTime as Date)
                                        : undefined,
                                    Mapping: payload.Mapping.filter(({ checked }: MailImportMapping) => checked).map(
                                        ({ Source, Destinations }: MailImportMapping) => ({
                                            Source,
                                            Destinations,
                                        })
                                    ),
                                },
                            };
                        }

                        return {
                            ...acc,
                            [importType]: importType === ImportType.CALENDAR ? calendarPayload : payloads[importType],
                        };
                    },
                    {
                        ImporterID: modalModel.payload.ImporterID,
                    }
                );

            setIsLoadingStartImportTask(true);

            try {
                await api(startImportTask(apiPayload));
                await call();

                setModalModel({
                    ...modalModel,
                    step: SUCCESS,
                });

                setIsLoadingStartImportTask(false);
            } catch (error) {
                /* Delete newly created calendars */
                if (createdCalendarMapping) {
                    await Promise.all(
                        createdCalendarMapping.map(async ({ Destination }) => api(removeCalendar(Destination)))
                    );
                    await call();
                }

                setIsLoadingStartImportTask(false);
                errorHandler(error);
            }
        }

        return null;
    };

    const submitRenderer = () => {
        if (showLoadingState) {
            return null;
        }

        if ([SELECT_IMPORT_TYPE, AUTHENTICATION].includes(modalModel.step)) {
            if (modalModel.oauthProps) {
                return (
                    <PrimaryButton type="submit" disabled={!selectedImportTypes.length || modalModel.isPayloadInvalid}>
                        {c('Action').t`Start import`}
                    </PrimaryButton>
                );
            }

            return (
                <PrimaryButton type="submit" disabled={!selectedImportTypes.length}>
                    {c('Action').t`Next`}
                </PrimaryButton>
            );
        }

        if (modalModel.step === SUCCESS && !isCurrentLocationImportPage) {
            return (
                <PrimaryButton
                    onClick={() => {
                        onClose();
                        settingsLink(`/easy-switch`);
                    }}
                >
                    {c('Action').t`Check import progress`}
                </PrimaryButton>
            );
        }

        return null;
    };

    const handleCancel = () => onClose();

    const cancelRenderer = () =>
        showLoadingState ? null : (
            <Button shape="outline" onClick={handleCancel}>
                {modalModel.step === SUCCESS ? c('Action').t`Close` : c('Action').t`Cancel`}
            </Button>
        );

    const titleRenderer = () => {
        if (showLoadingState) {
            return null;
        }

        switch (modalModel.step) {
            case AUTHENTICATION:
                return c('Title').t`Select what to import`;
            case SELECT_IMPORT_TYPE:
                return c('Title').t`Customize and confirm`;
            case SUCCESS:
                return null;
            default:
                return PRODUCT_NAMES.EASY_SWITCH;
        }
    };

    // const wizardSteps = [
    //     c('Wizard step').t`Authenticate`,
    //     c('Wizard step').t`Configure Import`,
    //     c('Wizard step').t`Import`,
    // ];

    return (
        <FormModal
            title={titleRenderer()}
            submit={submitRenderer()}
            close={cancelRenderer()}
            onSubmit={handleSubmit}
            onClose={handleCancel}
            {...rest}
        >
            {showLoadingState ? (
                <IALoadingStep
                    isLoadingOAuth={isLoadingOAuth}
                    isLoadingCreateCalendars={isLoadingCreateCalendars}
                    isLoadingStartImportTask={isLoadingStartImportTask}
                    calendarsToBeCreated={calendarsToBeCreatedCount}
                    createdCalendars={createdCalendarsCount}
                />
            ) : (
                <>
                    {/* <Wizard step={modalModel.step} steps={wizardSteps} /> */}
                    {[SELECT_IMPORT_TYPE, AUTHENTICATION].includes(modalModel.step) && (
                        <IASelectImportTypeStep
                            checkedTypes={checkedTypes}
                            updateCheckedTypes={(importTypes) => setCheckedTypes(importTypes)}
                            modalModel={modalModel}
                            toEmail={addressMap[modalModel.AddressID].Email}
                            calendars={calendars}
                            addresses={addresses}
                            labels={labels}
                            folders={folders}
                            updateModalModel={(newModel) => setModalModel(newModel)}
                        />
                    )}
                    {modalModel.step === SUCCESS && (
                        <ImportStartedStep
                            importedEmailAddress={modalModel.importedEmail}
                            toEmail={addressMap[modalModel.AddressID].Email}
                            onClose={onClose}
                        />
                    )}
                </>
            )}
        </FormModal>
    );
};

export default ImportAssistantOauthModal;