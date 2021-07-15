const { CURLParser } = require('parse-curl-js');
const yaml = require('write-yaml');
const axios = require('axios');
const fs = require('fs');
const url = require('url');
const curlsData = JSON.parse(fs.readFileSync('curls.json', 'utf-8'));
const paths = {};
const definitions = {
    "Error": {
        "type": "object",
        "properties": {
            "messages": {
                "type": "array",
                "items": {
                    "type": "string"
                }
            }
        }
    }
};
const swaggerObj = {
    "swagger": '2.0',
    "basePath": curlsData.basePath,
    "info": {
        "title": curlsData.title,
        "version": curlsData.version
    },
    "paths": paths,
    "definitions": definitions,
    "securityDefinitions": {
        "ApiKeyAuth": {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization'
        }
    },
    "security": [{ "ApiKeyAuth": [] }]
}

const envVars = {
}
main()
    .then((_) => console.log('done'))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });

async function main() {
    let isPresent = false;
    let i = -1;
    for (let element of curlsData.requests) {
        i++;
        const reqObj = new CURLParser(element).parse();
        const urlObj = url.parse(reqObj.url);
        const parameters = [];
        let pathKey = urlObj.pathname.split("%7B").join("{").split("%7D").join("}");
        pathKey = pathKey.substring(curlsData.basePath.length, pathKey.length)
        const inPathParams = pathKey.match(/{\w+?}/g);
        Object.keys(reqObj.headers).forEach(element => {
            parameters.push(addParameter("header", element));
        });
        inPathParams?.forEach(element => {
            parameters.push(addParameter("path", element.substring(1, element.length - 1)));
        });
        // console.log(index+1, pathKey);
        if (paths[pathKey]) {
            console.log(`repeating url ${reqObj.url}`)
        }
        if (!paths[pathKey]) {
            let response = {}
            try { response = await createResp(reqObj); }
            catch (e) { console.log(e); }
            definitions["model" + i] = response;
            paths[pathKey] = {
                [`${reqObj.method.toLocaleLowerCase()}`]: {
                    parameters: parameters,
                    produces: ["application/json"],
                    responses: {
                        "200": { description: "Status 200", schema: { $ref: `#/definitions/model${i}` } },
                        "400": { description: "Status 400", schema: { $ref: `#/definitions/Error` } }
                    }
                }
            };
            try {
                const queries = urlObj.query.split('&');
                queries.forEach(param => {
                    parameters.push(addParameter("query", param.split("=")[0]));
                });
            } catch (e) {
                delete paths[pathKey].parameters;
            }
        } else {
            console.log(element);
        }
    }
    if (!isPresent) {
        console.log(swaggerObj)
        isPresent = true;
        yaml('out.yml', swaggerObj, function (err) { });
    }
}
function addParameter(inParam, name) {
    return {
        name: name,
        required: true,
        in: inParam,
        type: "string"
    };
}
async function createResp(curlObj) {
    console.log(curlObj);
    updateObj(curlObj.headers)
    updateObj(curlObj.query)
    const url = updateUrl(curlObj.url.split('?')[0])
    const axiosObj = {
        headers: curlObj.headers,
        params: curlObj.query
    }
    const response = (await axios.get(url, axiosObj)).data
    console.log(response)
    return createRespObj(response);
}

function updateUrl(url) {
    url.match(/{(.*?)}/g)?.forEach(element => {
        const v = element.split('{')[1].split('}')[0];
        url = url.replace(element, envVars[v])
    });;
    return url;
}

function updateObj(obj) {
    Object.keys(obj).forEach(key => {
        if (!obj[key]) {
            obj[key] = envVars[key];
        }
        // obj[key] = envVars[key]
    });
}

function createRespObj(obj) {
    const resObj = {}
    switch (typeof obj) {
        case 'object':
            if (Array.isArray(obj)) {
                resObj.type = 'array';
                resObj.items = createRespObj(obj[0])
                break;
            }
            resObj.properties = {}
            resObj.type = 'object'
            Object.keys(obj).map(key => {
                resObj.properties[key] = createRespObj(obj[key]);
            });
            break;
        case 'number':
            resObj.type = 'integer'
            resObj.example = obj
            break;
        case 'string':
            resObj.type = 'string'
            resObj.example = obj
            break;
    }
    return resObj;
}
