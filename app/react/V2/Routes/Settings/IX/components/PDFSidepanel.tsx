/* eslint-disable max-lines */
/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable max-statements */
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSetAtom, useAtomValue } from 'jotai';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { TextSelection } from '@huridocs/react-text-selection-handler/dist/TextSelection';
import { Translate } from 'app/I18N';
import { ClientEntitySchema, ClientPropertySchema } from 'app/istore';
import { EntitySuggestionType } from 'shared/types/suggestionType';
import { FetchResponseError } from 'shared/JSONRequest';
import {
  ExtractedMetadataSchema,
  PropertyValueSchema,
  MetadataObjectSchema,
} from 'shared/types/commonTypes';
import { FileType } from 'shared/types/fileType';
import * as filesAPI from 'V2/api/files';
import * as entitiesAPI from 'V2/api/entities';
import { secondsToISODate } from 'V2/shared/dateHelpers';
import { Button, Sidepanel } from 'V2/Components/UI';
import { InputField, MultiselectList } from 'V2/Components/Forms';
import { PDF, selectionHandlers } from 'V2/Components/PDFViewer';
import { notificationAtom, thesauriAtom } from 'V2/atoms';
import { Highlights } from '../types';

interface PDFSidepanelProps {
  showSidepanel: boolean;
  setShowSidepanel: React.Dispatch<React.SetStateAction<boolean>>;
  suggestion?: EntitySuggestionType;
  onEntitySave: (entity: ClientEntitySchema) => any;
  property?: ClientPropertySchema;
}

enum HighlightColors {
  CURRENT = '#B1F7A3',
  NEW = '#F27DA5',
}

const getFormValue = (
  suggestion?: EntitySuggestionType,
  entity?: ClientEntitySchema,
  type?: string
) => {
  let value;

  if (!suggestion || !entity) {
    return value;
  }

  if (suggestion.propertyName === 'title' && entity.title) {
    value = entity.title;
  }

  if (suggestion.propertyName !== 'title' && entity.metadata) {
    const entityMetadata = entity.metadata[suggestion.propertyName];
    value = entityMetadata?.length ? entityMetadata[0].value : '';

    if (type === 'date' && value) {
      const dateString = secondsToISODate(value as number);
      value = dateString;
    }

    if (type === 'select' || type === 'multiselect' || type === 'relationship') {
      value = entityMetadata?.map((metadata: MetadataObjectSchema) => metadata.value);
    }
  }

  return value;
};

const loadSidepanelData = async ({ fileId, entityId, language }: EntitySuggestionType) => {
  const [file, entity] = await Promise.all([
    filesAPI.getById(fileId),
    entitiesAPI.getById({ _id: entityId, language }),
  ]);

  return { file: file[0], entity: entity[0] };
};

const handleFileSave = async (file?: FileType, newSelections?: ExtractedMetadataSchema[]) => {
  if (file && newSelections) {
    const fileToSave = { ...file };
    fileToSave.extractedMetadata = newSelections;
    return filesAPI.update(fileToSave);
  }

  return undefined;
};

const handleEntitySave = async (
  entity?: ClientEntitySchema,
  propertyName?: string,
  metadata?: PropertyValueSchema | PropertyValueSchema[] | undefined,
  fieldHasChanged?: boolean
) => {
  if (!fieldHasChanged || !entity || !propertyName) {
    return undefined;
  }

  let data;

  if (propertyName === 'title' && typeof metadata === 'string') {
    data = { title: metadata };
  } else {
    data = { properties: [{ [propertyName]: metadata }] };
  }

  const entityToSave = entitiesAPI.formatter.update(entity, data);

  return entitiesAPI.save(entityToSave);
};

const coerceValue = async (
  propertyType: 'date' | 'numeric',
  text: string | Date | undefined,
  documentLanguage: string = 'en'
) => {
  if (propertyType === 'date' && !Number.isNaN(text?.valueOf())) {
    return entitiesAPI.coerceValue(text!, 'date', documentLanguage);
  }

  if (propertyType === 'numeric' && typeof text === 'string') {
    return entitiesAPI.coerceValue(text.trim(), 'numeric', documentLanguage);
  }

  return undefined;
};

const PDFSidepanel = ({
  showSidepanel,
  setShowSidepanel,
  suggestion,
  onEntitySave,
  property,
}: PDFSidepanelProps) => {
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<FileType>();
  const [pdfContainerHeight, setPdfContainerHeight] = useState(0);
  const [selectedText, setSelectedText] = useState<TextSelection>();
  const [selectionError, setSelectionError] = useState<string>();
  const [highlights, setHighlights] = useState<Highlights>();
  const [selections, setSelections] = useState<ExtractedMetadataSchema[] | undefined>(undefined);
  const [labelInputIsOpen, setLabelInputIsOpen] = useState(true);
  const [entity, setEntity] = useState<ClientEntitySchema>();
  const [thesaurus, setThesaurus] = useState<any>();
  const setNotifications = useSetAtom(notificationAtom);
  const thesauris = useAtomValue(thesauriAtom);
  const templateId = suggestion?.entityTemplateId;
  const [initialValue, setInitialValue] = useState<PropertyValueSchema | PropertyValueSchema[]>();

  useEffect(() => {
    if (suggestion) {
      setInitialValue(getFormValue(suggestion, entity, property?.type));
    }
  }, [suggestion, entity, property]);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    values: {
      field: initialValue,
    },
  });

  useEffect(() => {
    if (property?.content) {
      const _thesaurus = thesauris.find(thes => thes._id === property.content);
      setThesaurus(_thesaurus);
    }

    return () => {
      setThesaurus(undefined);
    };
  }, [property, thesauris]);

  useEffect(() => {
    if (suggestion) {
      loadSidepanelData(suggestion)
        .then(({ file, entity: suggestionEntity }) => {
          setPdf(file);
          setEntity(suggestionEntity);
        })
        .catch(e => {
          throw e;
        });
    }

    return () => {
      setPdf(undefined);
      setEntity(undefined);
    };
  }, [suggestion]);

  useEffect(() => {
    if (pdf?.extractedMetadata && suggestion && showSidepanel) {
      setSelectedText(undefined);
      setHighlights(
        selectionHandlers.getHighlightsFromFile(
          pdf.extractedMetadata,
          suggestion.propertyName,
          HighlightColors.CURRENT
        )
      );
    }

    if (pdfContainerRef.current) {
      const { height } = pdfContainerRef.current.getBoundingClientRect();
      setPdfContainerHeight(height);
    }

    return () => {
      setSelectedText(undefined);
      setSelectionError(undefined);
      setHighlights(undefined);
      setSelections(undefined);
      setValue('field', undefined, { shouldDirty: false });
    };
  }, [pdf, setValue, showSidepanel, suggestion]);

  useEffect(() => {
    if (pdfContainerRef.current) {
      const { height } = pdfContainerRef.current.getBoundingClientRect();
      setPdfContainerHeight(height);
    }
  }, [labelInputIsOpen, pdfContainerRef.current]);

  const onSubmit = async (value: {
    field: PropertyValueSchema | PropertyValueSchema[] | undefined;
  }) => {
    if (!property) {
      throw new Error('Property not found');
    }

    let metadata = value.field;

    if (property.type === 'date' && isDirty && metadata) {
      metadata = (await coerceValue('date', metadata as string, pdf?.language || 'en'))?.value;
    }

    const [savedFile, savedEntity] = await Promise.all([
      handleFileSave(pdf, selections),
      handleEntitySave(entity, property.name, metadata, isDirty),
    ]);

    if (savedFile instanceof FetchResponseError || savedEntity instanceof FetchResponseError) {
      const details =
        (savedFile as FetchResponseError)?.json.prettyMessage ||
        (savedEntity as FetchResponseError)?.json.prettyMessage;

      setNotifications({ type: 'error', text: 'An error occurred', details });
    } else if (savedFile || savedEntity) {
      if (savedFile) {
        setPdf(savedFile);
      }

      if (savedEntity) {
        setEntity(savedEntity);
        onEntitySave(savedEntity);
      }

      setNotifications({ type: 'success', text: 'Saved successfully.' });
    }

    setShowSidepanel(false);
  };

  const handleClickToFill = async () => {
    if (!property) {
      throw new Error('Property not found');
    }

    if (selectedText) {
      setHighlights(
        selectionHandlers.getHighlightsFromSelection(selectedText, HighlightColors.NEW)
      );
      setSelections(
        selectionHandlers.updateFileSelection(
          { name: suggestion?.propertyName || '', id: property._id as string },
          pdf?.extractedMetadata,
          selectedText
        )
      );

      if (property.type === 'date' || property.type === 'numeric') {
        const coercedValue = await coerceValue(property.type, selectedText.text, pdf?.language);

        if (!coercedValue?.success) {
          setSelectionError('Value cannot be transformed to the correct type');
        }

        if (coercedValue?.success) {
          setValue('field', secondsToISODate(coercedValue.value), { shouldDirty: true });
          setSelectionError(undefined);
        }
      } else {
        setValue('field', selectedText.text, { shouldDirty: true });
      }
    }
  };

  const renderInputText = (type: 'text' | 'date' | 'numeric') => {
    if (!property) {
      return null;
    }
    const inputType = type === 'numeric' ? 'number' : type;
    return (
      <div className={`relative flex gap-2 px-4 pb-4 grow ${labelInputIsOpen ? '' : 'hidden'}`}>
        <div className="grow">
          <InputField
            clearFieldAction={() => {
              setValue('field', '');
            }}
            id={property.label}
            label={<Translate context={templateId}>{property.label}</Translate>}
            hideLabel
            type={inputType}
            hasErrors={errors.field?.type === 'required' || !!selectionError}
            {...register('field', {
              required: property.required,
              valueAsDate: property.type === 'date' || undefined,
            })}
          />
        </div>
        <div>
          <Button
            type="button"
            styling="outline"
            onClick={async () => handleClickToFill()}
            disabled={!selectedText?.selectionRectangles.length || isSubmitting}
          >
            <Translate className="">Click to fill</Translate>
          </Button>
        </div>
        <div className="sm:text-right" data-testid="ix-clear-button-container">
          <Button
            type="button"
            styling="outline"
            disabled={Boolean(!highlights) || isSubmitting}
            onClick={() => {
              setHighlights(undefined);
              setSelections(
                selectionHandlers.deleteFileSelection(
                  { name: suggestion?.propertyName || '' },
                  pdf?.extractedMetadata
                )
              );
            }}
          >
            <Translate>Clear</Translate>
          </Button>
        </div>
      </div>
    );
  };

  interface Option {
    label: string | React.ReactNode;
    searchLabel: string;
    value: string;
    items?: Option[];
  }

  const renderSelect = (type: 'select' | 'multiselect' | 'relationship') => {
    const options: Option[] = [];
    thesaurus?.values.forEach((value: any) => {
      options.push({
        label: <Translate context={property?.content}>{value.label}</Translate>,
        searchLabel: value.label.toLowerCase(),
        value: value.id,
      });
    });

    return (
      <div className={`px-4 pb-4 overflow-y-scroll grow ${labelInputIsOpen ? '' : 'hidden'}`}>
        <MultiselectList
          onChange={values => {
            setValue('field', values, { shouldDirty: true });
          }}
          value={getValues('field') as string[]}
          items={options}
          checkboxes
          singleSelect={type === 'select'}
        />
      </div>
    );
  };

  const renderLabel = () => {
    switch (property?.type) {
      case 'text':
      case 'date':
      case 'numeric':
        return renderInputText(property?.type);
      case 'select':
      case 'multiselect':
      case 'relationship':
        return renderSelect(property?.type);
      default:
        return '';
    }
  };

  return (
    <div className="h-full">
      <Sidepanel
        isOpen={showSidepanel}
        withOverlay
        size="large"
        title={entity?.title}
        closeSidepanelFunction={() => setShowSidepanel(false)}
      >
        <div className="flex-grow">
          <form
            id="ixpdfform"
            className="flex flex-col h-full gap-4 p-0"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div ref={pdfContainerRef} className="w-full md:m-auto grow">
              {pdf && (
                <PDF
                  fileUrl={`/api/files/${pdf.filename}`}
                  highlights={highlights}
                  onSelect={selection => {
                    if (!selection.selectionRectangles.length) {
                      setSelectionError('Could not detect the area for the selected text');
                      setSelectedText(undefined);
                    } else {
                      setSelectionError(undefined);
                      setSelectedText(selection);
                    }
                  }}
                  size={{
                    height: `${pdfContainerHeight - 90}px`,
                    width: '100%',
                  }}
                  scrollToPage={!selectedText ? Object.keys(highlights || {})[0] : undefined}
                />
              )}
            </div>
          </form>{' '}
        </div>
        <Sidepanel.Footer
          className={`absolute max-h-[40%] ${labelInputIsOpen && ['select', 'multiselect', 'relationship'].includes(property?.type || '') ? 'h-[40%]' : ''}`}
        >
          <div className="relative flex flex-col h-full py-0 border border-b-0 border-l-0 border-r-0 border-gray-200 border-t-1">
            <div className="sticky top-0 flex px-4 py-2 bg-white">
              <p className={selectionError ? 'text-pink-600 grow' : 'grow'}>
                <Translate className="uppercase" context={templateId}>
                  {property?.label}
                </Translate>{' '}
                {selectionError && <span>{selectionError}</span>}
              </p>
              <span onClick={() => setLabelInputIsOpen(old => !old)} className="cursor-pointer">
                {labelInputIsOpen ? <ChevronDownIcon width={20} /> : <ChevronUpIcon width={20} />}
              </span>
            </div>
            {renderLabel()}
            <div className="sticky bottom-0 flex justify-end gap-2 px-4 py-2 bg-white border border-b-0 border-l-0 border-r-0 border-gray-200 border-t-1">
              <Button
                type="button"
                styling="outline"
                disabled={isSubmitting}
                onClick={() => {
                  setShowSidepanel(false);
                  reset();
                }}
              >
                <Translate>Cancel</Translate>
              </Button>
              <Button type="submit" form="ixpdfform" disabled={isSubmitting} color="success">
                <Translate>Accept</Translate>
              </Button>
            </div>
          </div>
        </Sidepanel.Footer>
      </Sidepanel>
    </div>
  );
};

export { PDFSidepanel };
