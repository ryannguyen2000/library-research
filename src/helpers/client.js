import axios from "axios";
import _ from "lodash";

import { currentLanguage } from "@languageProvider/config";
import apiUrl from "@settings/index";
import notify from "@components/notification";
import { getToken, clearToken } from "./utility";

const notification = _.throttle(notify, 1000);
let token = getToken();

function validateUrl(url) {
  if (!url || !url.match(/^http(s*):\/\//)) {
    url = `${apiUrl}${url}`;
  }
  return url;
}

function client(noNotify, opts = {}) {
  const defaultOptions = {
    headers: {
      lang: currentLanguage,
      "ngrok-skip-browser-warning": true,
    },
  };
  if (!opts.noToken) {
    if (!token) token = getToken();
    _.set(defaultOptions, ["headers", "x-access-token"], token);
  }

  return {
    get: (url, options) =>
      axios
        .get(validateUrl(url), _.merge(defaultOptions, options))
        .then(res => handleResponse(res, noNotify, options))
        .catch(err => handleError(err, noNotify, options)),
    post: (url, data, options) =>
      axios
        .post(validateUrl(url), data, _.merge(defaultOptions, options))
        .then(res => handleResponse(res, noNotify, options))
        .catch(err => handleError(err, noNotify, options)),
    put: (url, data, options) =>
      axios
        .put(validateUrl(url), data, _.merge(defaultOptions, options))
        .then(res => handleResponse(res, noNotify, options))
        .catch(err => handleError(err, noNotify, options)),
    delete: (url, data, options) =>
      axios
        .delete(validateUrl(url), _.merge(defaultOptions, options, { data }))
        .then(res => handleResponse(res, noNotify, options))
        .catch(err => handleError(err, noNotify, options)),
  };
}

function isRequestSuccess(res) {
  return !!res && res.error_code === 0;
}

async function parseResponseData(response, options, noNotify) {
  try {
    const isBinRes = ["blob", "binary"].includes(_.get(options, "responseType"));

    if (isBinRes && !_.includes(_.get(response, ["headers", "content-type"]), "json")) {
      return response;
    }

    let parsedRes;

    if (isBinRes) {
      parsedRes = JSON.parse(await response.data.text());
    } else {
      parsedRes = response.data;
    }

    if (!isRequestSuccess(parsedRes) && !noNotify) {
      notification("error", "Error!", parsedRes.error_msg || "Can't connect to server...");
    }

    return parsedRes;
  } catch (e) {
    console.error("parseResponseData", e);
    return response.data;
  }
}

function handleResponse(response, noNotify, options) {
  return parseResponseData(response, options, noNotify);
}

function handleError(error, noNotify, options) {
  if (_.get(error, "response.status") === 401) {
    return logout();
  }

  if (error.response) {
    return parseResponseData(error.response, options, noNotify);
  }

  if (!noNotify) {
    notification("error", "Error!", "Can't connect to server...");
  }

  return error;
}

function logout() {
  clearToken();
  window.location.href = "/signin";
}

export default client;
