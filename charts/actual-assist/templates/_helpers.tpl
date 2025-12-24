{{/*
Expand the name of the chart.
*/}}
{{- define "actual-assist.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "actual-assist.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "actual-assist.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "actual-assist.labels" -}}
helm.sh/chart: {{ include "actual-assist.chart" . }}
{{ include "actual-assist.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "actual-assist.selectorLabels" -}}
app.kubernetes.io/name: {{ include "actual-assist.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for backend
*/}}
{{- define "actual-assist.backend.selectorLabels" -}}
{{ include "actual-assist.selectorLabels" . }}
component: backend
{{- end }}

{{/*
Selector labels for frontend
*/}}
{{- define "actual-assist.frontend.selectorLabels" -}}
{{ include "actual-assist.selectorLabels" . }}
component: frontend
{{- end }}

{{/*
Secret name helper: use existingSecretName if provided, else default to chart fullname
*/}}
{{- define "actual-assist.secretName" -}}
{{- default (include "actual-assist.fullname" .) .Values.secrets.existingSecretName -}}
{{- end -}}
