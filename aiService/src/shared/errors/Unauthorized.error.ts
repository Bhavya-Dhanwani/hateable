import ApiError from "../utils/ApiError.util.js";
import HTTP_STATUS from "../constants/StatusCodes.constants.js";

class Unauthorized extends ApiError {

    constructor(message: string = "Unauthorized") {

        // calling the parent class constructor
        super(HTTP_STATUS.UNAUTHORIZED, message);

        // setting the message for the error
        this.message = message;

    }

}

export default Unauthorized;
