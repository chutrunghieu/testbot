import { HttpService } from '@nestjs/axios';
import { Observable, of } from 'rxjs';
import { AxiosError } from 'axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HttpLib {
  protected BASE_API: string;
  protected API_KEY: string;

  protected BASE_URL;
  constructor(protected readonly http: HttpService) {}

  protected setApiKey(apiKey) {
    this.API_KEY = apiKey;
  }

  async makeRequest(
    method = 'POST',
    url: string,
    param?: object,
    header?: object,
  ) {
    try {
      header = {
        ...header,
        'Content-Type': 'application/json; charset=utf-8',
      };
      if (this.API_KEY) {
        header = {
          ...header,
          Authorization: this.API_KEY,
        };
      }

      let res: any;
      switch (method) {
        case 'POST':
          res = await this.http.axiosRef.post(url, param, {
            headers: header,
          });
          break;
        case 'GET':
          res = await this.http.axiosRef.get(url, {
            headers: header,
            params: param,
          });
          break;
        case 'PATCH':
          res = await this.http.axiosRef.patch(url, param, {
            headers: header,
          });
          break;
        case 'PUT':
          res = await this.http.axiosRef.put(url, param, {
            headers: header,
          });
          break;
        case 'DELETE':
          res = await this.http.axiosRef.delete(url, {
            headers: header,
          });
          break;
      }
      return res;
    } catch (error) {
      console.log('HTTP Request error:', error.stack);
    }
  }

  handleError<T>(result?: T) {
    return (error: AxiosError<any>): Observable<T> => {
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      }

      return of(result as T);
    };
  }
}
