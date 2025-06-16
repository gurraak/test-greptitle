from flask import Flask, request, jsonify, send_file
from pymongo import MongoClient
from flask_cors import CORS
import os
import requests
from io import BytesIO
import urllib.parse
import hashlib
import traceback

app = Flask(__name__)
CORS(app)
ARTIFACTORY_USERNAME = os.environ.get("ARTIFACTORY_USERNAME")
ARTIFACTORY_PASSWORD = os.environ.get("ARTIFACTORY_PASSWORD")
ENV_LOCATION = os.environ.get("ENV_LOCATION")
MONGO_FQDN = os.environ.get("MONGO_FQDN")
client = MongoClient(MONGO_FQDN)
db = client['naavi']
forms_collection = db['new_forms']
mops_collection = db['mops']
questionnaire_collection = db['questionnaire']
nf_and_version_collection = db['nf_and_version']
# Directory for file uploads

# UPLOAD_FOLDER = 'uploads'
# if not os.path.exists(UPLOAD_FOLDER):
#     os.makedirs(UPLOAD_FOLDER)


# api to retrieve a questionnaire section
@app.route("/api/questionnaire", methods=["GET"])
def get_questionnaire():
    # Get parameters from URL
    nf_name = request.args.get("nfName")
    version = request.args.get("version")
    section = request.args.get("section")

    # Query MongoDB
    if section:
        # Get a single section
        cursor = questionnaire_collection.find(
            {"nf_name": nf_name, "version": version, "section_name": section},
            projection={"_id": 0},
        )
    else:
        # Get all sections
        cursor = questionnaire_collection.find(
            {"nf_name": nf_name, "version": version}, projection={"_id": 0}
        )

    # Create a dictionary to store sections and their questions
    sections = []

    # Loop over the MongoDB result cursor
    for doc in cursor:
        sections.append(doc)
    # Create the response
    response = {"nfName": nf_name, "version": version, "sections": sections}

    return jsonify(response)


# API endpoint to create a new Questionnaire document
@app.route("/api/questionnaire", methods=["POST"])
def create_questionnaire():
    data = request.get_json()
    nf_name = data["nfName"]
    version = data["version"]
    sections = data["sections"]
    status = data["status"]
    if "latest" in data.keys():
        latest = data["latest"]
    else:
        latest = False
    for section in sections:
        questions = section["questions"]
        section_name = section["sectionName"]

        # Validate the version
        # if version not in ['v1.0.0', 'v2.1.3', 'v3.0.2', 'v3.5.1-beta']:
        #     return jsonify({'error': 'Invalid version'}), 400

        # Validate the questions
        if not questions:
            return jsonify({"error": "No questions provided"}), 400

        # Create a new Questionnaire document
        questionnaire_doc = {
            'version': version,
            'nf_name': nf_name,
            'section_name': section_name,
            'questions': questions,
            # 'uploadedFiles': uploaded_files
        }
        result = questionnaire_collection.update_one(
            {'nf_name': nf_name, 'section_name': section_name, 'version': version},
            {
                "$set": {
                    "nf_name": nf_name,
                    "section_name": section_name,
                    "version": version,
                    "questions": questions,
                    # 'uploadedFiles': uploaded_files
                }
            },
            upsert=True,
        )
    nf_and_version_collection.update_one(
        {"nf_name": nf_name},
        {
            "$set": {
                "versions.$[version].status": status,
                "versions.$[version].latest": latest,
            }
        },
        array_filters=[{"version.name": version}],
    )
    return jsonify({"message": "Questionnaire created successfully"}), 201


@app.route("/api/set_latest", methods=["POST"])
def set_latest():
    nf_name = request.args.get("nf_name")
    version_name = request.args.get("version_name")
    # set all of the versions to not be latest
    nf_and_version_collection.update_one(
        {"nf_name": nf_name}, {"$set": {"versions.$[].latest": True}}
    )
    # set the api passed in version as latest
    nf_and_version_collection.update_one(
        {"nf_name": nf_name},
        {
            "$set": {
                "versions.$[version].latest": True,
            }
        },
        array_filters=[{"version.name": version_name}],
    )
    return jsonify({"message": f"{version_name} updated to be latest version."}), 201


@app.route("/api/download_file", methods=["GET"])
def download_file():
    nf_name = request.args.get("nf_name")
    version_name = request.args.get("version_name")
    section = request.args.get("section")
    file_name = request.args.get("file_name")
    url = f"https://oneartifactoryci.verizon.com/artifactory/jwov-atlas-generic-prod/naavi/{ENV_LOCATION}/{nf_name}/{version_name}/{section}/{file_name}"
    # print(url)
    # print(request.json)
    auth = (ARTIFACTORY_USERNAME, ARTIFACTORY_PASSWORD)
    response = requests.get(url, auth=auth, stream=True)

    parsed_url = urllib.parse.urlparse(url)
    path = parsed_url.path
    file_name = path.split("/")[-1]
    # print(file_name)
    if response.ok:
        return send_file(
            BytesIO(response.content), as_attachment=True, download_name=file_name
        )
    else:
        traceback.print_exc()
        return "Error downloading file", response.status_code


@app.route("/api/upload", methods=["POST"])
def upload_file():
    # Check if the request has a file
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    # Get the file and data from the request
    nf_name = request.form.get("nf_name")
    section = request.form.get("section")
    version_name = request.form.get("version")
    question_id = request.form.get("questionId")
    file_list = []

    for file in request.files.values():
        print(type(file))
        print(file)
        file_name = file.filename
        file_hash = hashlib.md5()

        try:
            chunk = file.stream.read(4096)
            while chunk:
                file_hash.update(chunk)
                chunk = file.stream.read(4096)
            file.stream.seek(0)  # Reset the file stream
            checksum = file_hash.hexdigest()

            # Upload the file to Artifactory
            url = f"https://oneartifactoryci.verizon.com/artifactory/jwov-atlas-generic-prod/naavi/{ENV_LOCATION}/{nf_name}/{version_name}/{section}/{file_name}"
            headers = {"Content-Type": file.mimetype}
            response = requests.put(
                url,
                auth=(ARTIFACTORY_USERNAME, ARTIFACTORY_PASSWORD),
                data=file,
                headers=headers,
            )

            # Check if the upload was successful
            if response.status_code == 201:
                try:
                    result = questionnaire_collection.update_one(
                        {
                            "nf_name": nf_name,
                            "section_name": section,
                            "version": version_name,
                        },
                        {
                            "$addToSet": {
                                "files": {
                                    "filename": file.filename,
                                    "checksum": checksum,
                                    "question_id": question_id,
                                }
                            }
                        },
                        upsert=True,
                    )
                    file_list.append(file_name)
                except Exception as e:
                    print(f"Error updating database: {e}")
                    traceback.print_exc()
                    return jsonify({"error": "Failed to update database"}), 500
            else:
                return jsonify({"error": "Failed to upload file to Artifactory"}), 500
        except Exception as e:
            print(f"Failed to process file: {e}")
            traceback.print_exc()
            return jsonify({"error": "Failed to process file"}), 500

    return jsonify(
        {
            "message": "File uploaded successfully",
            "files": file_list,
            "nf_name": nf_name,
            "section": section,
            "version": version_name,
        }
    ), 201


# DELETE endpoint to handle file deletion
@app.route("/api/delete_file", methods=["DELETE"])
def delete_file():
    nf_name = request.args.get("nf_name")
    version_name = request.args.get("version_name")
    section = request.args.get("section")
    file_name = request.args.get("file_name")
    url = f"https://oneartifactoryci.verizon.com/artifactory/jwov-atlas-generic-prod/naavi/{ENV_LOCATION}/{nf_name}/{version_name}/{section}/{file_name}"
    auth = (ARTIFACTORY_USERNAME, ARTIFACTORY_PASSWORD)
    response = requests.delete(url, auth=auth)

    if response.ok:
        try:
            result = questionnaire_collection.update_one(
                {"nf_name": nf_name, "section_name": section, "version": version_name},
                {"$pull": {"files": {"filename": file_name}}},
            )
            if result.modified_count == 0:
                return jsonify(
                    {"error": f"File {file_name} not found in database"}
                ), 404
        except Exception as e:
            print(f"Error updating database: {e}")
            traceback.print_exc()
            return jsonify({"error": "Failed to update database"}), 500
        return jsonify({"message": f"File {file_name} deleted successfully"}), 200
    else:
        # always clean up from db
        if response.status_code == 404:
            result = questionnaire_collection.update_one(
                {"nf_name": nf_name, "section_name": section, "version": version_name},
                {"$pull": {"files": {"filename": file_name}}},
            )
            return jsonify({"error": f"File {file_name} found in database"}), 200
        return jsonify(
            {"error": f"Failed to delete file {file_name}"}
        ), response.status_code


@app.route("/api/nf_info", methods=["GET"])
def get_nf_info():
    nf_info = list(nf_and_version_collection.find({}, {"_id": 0}))
    return jsonify(nf_info)


# Create a POST API to add a new version to a specific NF
@app.route("/api/add_version", methods=["POST"])
def add_version():
    data = request.get_json()
    nf_name = data["nfName"]
    version = data["version"]
    # version_obj = {"version": version, "status": "Not Started", "latest": False}
    # Find the document with the matching nf_name
    nf_document = nf_and_version_collection.find_one({"nf_name": nf_name})

    if nf_document:
        # Add the new version to the document
        nf_and_version_collection.update_one(
            {"nf_name": nf_name}, {"$addToSet": {"versions": version}}
        )
        return jsonify({"message": f"Version {version} added to {nf_name}"}), 200
    else:
        return jsonify({"error": f"NF {nf_name} not found"}), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5004)
